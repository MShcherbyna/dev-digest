import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { eq, count } from 'drizzle-orm';
import * as t from '../db/schema.js';
import { getContext } from '../modules/_shared/context.js';

/**
 * demo-review-fixture-2 — NOT wired into container.ts or any route registry.
 * Second batch of intentional defects for testing the review agent, focused
 * on CRITICAL-severity cases (tenant isolation, race conditions, inverted
 * guards). Safe to delete at any time.
 */
export default async function demoReviewFixture2Routes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  // Bug 1 (CRITICAL): deletes a run by id only — no `workspaceId` predicate
  // in the `where`, so any authenticated caller can delete another
  // workspace's run by guessing/enumerating its id. Broken tenant isolation
  // plus irreversible data loss.
  app.delete('/internal/demo/runs/:runId', async (req) => {
    await getContext(container, req);
    const { runId } = req.params as { runId: string };

    await container.db.delete(t.agentRuns).where(eq(t.agentRuns.id, runId));
    return { deleted: true };
  });

  // Bug 2 (CRITICAL): inverted guard — a run flagged `locked` (e.g. still
  // attached to an open PR review) should be protected from deletion, but
  // the `!` here deletes exactly the locked runs and leaves unlocked ones
  // alone, the opposite of the intended safety check.
  app.post('/internal/demo/runs/:runId/purge', async (req) => {
    await getContext(container, req);
    const { runId } = req.params as { runId: string };

    const [run] = await container.db
      .select({ status: t.agentRuns.status })
      .from(t.agentRuns)
      .where(eq(t.agentRuns.id, runId));
    const locked = run?.status === 'locked';

    if (!locked) {
      return { purged: false, reason: 'run is locked' };
    }
    await container.db.delete(t.agentRuns).where(eq(t.agentRuns.id, runId));
    return { purged: true };
  });

  // Bug 3 (CRITICAL): TOCTOU race on a per-workspace run quota. Two
  // concurrent requests can both read `used < limit` before either of their
  // inserts commits, so both proceed — the quota check-then-act isn't
  // atomic (no transaction, no `SELECT ... FOR UPDATE`, no DB-level
  // constraint), letting concurrent callers exceed the plan limit.
  app.post('/internal/demo/runs', async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const body = req.body as { prId: string };
    const PLAN_LIMIT = 100;

    const rows = await container.db
      .select({ used: count() })
      .from(t.agentRuns)
      .where(eq(t.agentRuns.workspaceId, workspaceId));
    const used = rows[0]!.used;

    if (used >= PLAN_LIMIT) {
      return reply.code(402).send({ error: 'run quota exceeded' });
    }

    const [created] = await container.db
      .insert(t.agentRuns)
      .values({ workspaceId, prId: body.prId, source: 'local' })
      .returning();
    return created;
  });
}
