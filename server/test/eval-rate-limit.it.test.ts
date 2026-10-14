import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { GHOST, StubLLM } from './helpers/eval.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-rate-limit] Docker not available — skipping integration tests.');
}

d('eval rate limits (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('the 11th call within a minute is a 429 on each of the three limited POST routes', async () => {
    // Catches: per-route `config.rateLimit` missing or inert on routes that start paid LLM work
    // (the global plugin is not registered under NODE_ENV=test, so only a production-mode app proves it).
    const app = await buildApp({
      config: {
        ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
        nodeEnv: 'production',
        logLevel: 'silent',
      },
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: new StubLLM(), openrouter: new StubLLM() },
      },
    });
    try {
      // Unknown ids: each call is a 404 until the limiter trips, and no paid work can start.
      const routes = [
        `/findings/${GHOST}/eval-case`,
        `/eval-cases/${GHOST}/run`,
        `/agents/${GHOST}/eval-runs`,
      ];
      for (const url of routes) {
        const statuses: number[] = [];
        for (let i = 0; i < 11; i++) statuses.push((await app.inject({ method: 'POST', url })).statusCode);
        expect(statuses.slice(0, 10), url).toEqual(Array(10).fill(404));
        expect(statuses[10], url).toBe(429);
      }
    } finally {
      await app.close();
    }
  });
});
