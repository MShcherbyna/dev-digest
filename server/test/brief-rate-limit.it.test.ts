import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { BRIEF_FIXTURE, fakeBlastIntel, seedBriefPr } from './helpers/brief.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockLLMProvider,
  MockPriorPrSource,
  MockRepoDocsSource,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import { BRIEF_SCHEMA_NAME } from '../src/modules/brief/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[brief-rate-limit] Docker not available — skipping integration tests.');
}

d('PR Brief rate limit (Testcontainers pg)', () => {
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

  it('AC-32: the 11th POST within a minute is a 429 and the model is called at most 10 times', async () => {
    // Catches: the per-route `max: 10` being inert (the global plugin is not registered under NODE_ENV=test), i.e. unbounded paid generations.
    const llm = new MockLLMProvider('openai', { structuredBySchema: { [BRIEF_SCHEMA_NAME]: BRIEF_FIXTURE } });
    // A fresh app instance: the rate-limit store is in memory per instance. `production` registers
    // @fastify/rate-limit (app.ts); `logLevel: 'silent'` avoids the dev-only pino-pretty transport.
    const app = await buildApp({
      config: {
        ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
        nodeEnv: 'production',
        logLevel: 'silent',
      },
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ head: 'head-1' }),
        github: new MockGitHubClient(),
        repoIntel: fakeBlastIntel,
        priorPrs: new MockPriorPrSource(),
        repoDocs: new MockRepoDocsSource({}),
        secrets: new MockSecretsProvider({}),
        llm: { openai: llm },
      },
    });
    try {
      const { prId } = await seedBriefPr(pg.handle.db, { workspaceId });
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief/generate` });
        statuses.push(res.statusCode);
      }
      expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
      expect(statuses[10]).toBe(429);
      expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(10);
      // reads are not subject to the 10/min route limit
      const read = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
      expect(read.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
