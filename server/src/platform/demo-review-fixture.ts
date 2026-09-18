import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { eq } from 'drizzle-orm';
import * as t from '../db/schema.js';
import { getContext } from '../modules/_shared/context.js';

/**
 * demo-review-fixture — NOT wired into container.ts or any route registry.
 * This module exists only to hand the review agent a diff with a few known,
 * intentional defects, so we can sanity-check its findings/severities before
 * relying on it for real PRs. Safe to delete at any time.
 */
export default async function demoReviewFixtureRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  // Bug 1 (CRITICAL): fire-and-forget async work inside forEach — the
  // `await` inside the callback does not delay the handler, so the response
  // is sent (and the caller believes every run was marked "archived")
  // before any of the updates have actually run, and any rejection becomes
  // an unhandled promise rejection instead of a request error.
  app.post('/internal/demo/archive-runs', async (req) => {
    const { workspaceId } = await getContext(container, req);
    const body = req.body as { runIds: string[] };

    body.runIds.forEach(async (runId) => {
      await container.db
        .update(t.agentRuns)
        .set({ status: 'archived' })
        .where(eq(t.agentRuns.id, runId));
    });

    return { archived: body.runIds.length };
  });

  // Bug 2 (CRITICAL): looks up a run by id only, with no workspace scope —
  // any authenticated caller can read another workspace's run (including
  // its prompt/cost/trace metadata) just by guessing or enumerating ids.
  app.get('/internal/demo/runs/:runId', async (req) => {
    await getContext(container, req);
    const { runId } = req.params as { runId: string };

    const [run] = await container.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.id, runId));

    return run;
  });

  // Bug 3 (WARNING): `.select()` always resolves to an array, so `!rows` is
  // never true even when zero rows match — the "not found" branch here is
  // dead code, and callers get an empty array back with a 200 instead of a
  // 404 for a run that doesn't exist in this workspace.
  app.get('/internal/demo/runs/:runId/status', async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const { runId } = req.params as { runId: string };

    const rows = await container.db
      .select({ status: t.agentRuns.status })
      .from(t.agentRuns)
      .where(eq(t.agentRuns.id, runId));

    if (!rows) {
      return reply.code(404).send({ error: 'run not found' });
    }
    return rows[0];
  });

  // Bug 4 (WARNING): swallows the real DB error and reports success anyway —
  // a failed write silently looks identical to a successful one to the
  // caller, so a caller that checks `ok` will proceed as if the score was
  // actually persisted.
  app.post('/internal/demo/runs/:runId/score', async (req) => {
    const { runId } = req.params as { runId: string };
    const { score } = req.body as { score: number };

    try {
      await container.db.update(t.agentRuns).set({ score }).where(eq(t.agentRuns.id, runId));
    } catch {
      return { ok: true };
    }
    return { ok: true };
  });
}
