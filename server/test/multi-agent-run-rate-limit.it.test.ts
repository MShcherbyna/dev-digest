import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[multi-agent-run-rate-limit] Docker not available — skipping integration tests.');
}

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/**
 * NFR-2: one `POST /pulls/:id/multi-agent-run` call counts as a single
 * request against the existing 10/min rate limit — it must not multiply by
 * the number of agents requested. Mirrors the pattern in
 * `brief-rate-limit.it.test.ts` (per-route `config.rateLimit` is inert under
 * `NODE_ENV=test`, so a dedicated `nodeEnv: 'production'` app is required).
 */
d('Multi-Agent Review rate limit (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('the 11th POST /pulls/:id/multi-agent-run within a minute is 429, regardless of agent count', async () => {
    const app = await buildApp({
      config: {
        ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
        nodeEnv: 'production',
        logLevel: 'silent',
      },
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          openai: new MockLLMProvider('openai', { structured: { verdict: 'approve', summary: 's', score: 90, findings: [] } }),
          openrouter: new MockLLMProvider('openai', {
            structured: {
              intent: 'Test PR intent.',
              in_scope: [],
              out_of_scope: [],
              risk_areas: [],
              model_confidence: 'medium',
            },
          }),
        },
      },
    });
    try {
      const [repo] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId, owner: 'acme', name: 'rl-repo', fullName: 'acme/rl-repo' })
        .returning();

      // 4 enabled agents per PR — each POST requests all 4, so if the limiter
      // wrongly counted per-agent, 3 calls (4 agents each = 12) would already
      // exceed 10; this proves it counts once per call instead.
      const agentIds: string[] = [];
      for (let i = 0; i < 4; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/agents',
          payload: { name: `RL Agent ${i}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
        });
        agentIds.push(res.json().id);
      }

      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        const [pr] = await pg.handle.db
          .insert(t.pullRequests)
          .values({
            workspaceId,
            repoId: repo!.id,
            number: 2000 + i,
            title: `RL PR ${i}`,
            author: 'marisa.koch',
            branch: `feat/rl-${i}`,
            base: 'main',
            headSha: 'a1b2c3d4',
            additions: 1,
            deletions: 0,
            filesCount: 1,
            status: 'needs_review',
          })
          .returning();
        await pg.handle.db.insert(t.prFiles).values({
          prId: pr!.id,
          path: 'src/config.ts',
          additions: 1,
          deletions: 0,
          patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
        });
        const res = await app.inject({
          method: 'POST',
          url: `/pulls/${pr!.id}/multi-agent-run`,
          payload: { agent_ids: agentIds },
        });
        statuses.push(res.statusCode);
        if (res.statusCode === 200) {
          // Cancel immediately so the background fan-out doesn't keep running
          // (and doesn't matter for this test, which only checks the counter).
          await app.inject({ method: 'POST', url: `/multi-agent-runs/${res.json().id}/cancel` });
        }
      }
      expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
      expect(statuses[10]).toBe(429);
    } finally {
      await app.close();
    }
  });
});
