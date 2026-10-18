import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockCiGitHub, MockRunnerBundle, MockSecretsProvider } from '../src/adapters/mocks.js';
import { GHOST } from './helpers/eval.js';
import { exportBody, previewBody } from './helpers/ci.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci-rate-limit] Docker not available — skipping integration tests.');
}

d('CI rate limits (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('NFR-3: the 11th call within a minute is a 429 on preview, export, remove and refresh', async () => {
    // Catches: per-route `config.rateLimit` missing or inert (the global plugin is not registered
    // under NODE_ENV=test, so only a production-mode app proves it).
    const app = await buildApp({
      config: {
        ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
        nodeEnv: 'production',
        logLevel: 'silent',
      },
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider({}),
        ciGitHub: new MockCiGitHub(),
        runnerBundle: new MockRunnerBundle(),
      },
    });
    try {
      // Unknown ids / no installations: every call is cheap (404 or an empty 200) until the limiter trips.
      const calls: [string, () => Promise<{ statusCode: number }>, number][] = [
        ['preview', () => app.inject({ method: 'POST', url: `/agents/${GHOST}/ci/preview`, payload: previewBody('a/b') }), 404],
        ['export', () => app.inject({ method: 'POST', url: `/agents/${GHOST}/export-ci`, payload: exportBody('a/b') }), 404],
        ['remove', () => app.inject({ method: 'POST', url: `/ci/installations/${GHOST}/remove` }), 404],
        ['refresh', () => app.inject({ method: 'POST', url: '/ci-runs/refresh' }), 200],
      ];
      for (const [name, call, ok] of calls) {
        const statuses: number[] = [];
        for (let i = 0; i < 11; i++) statuses.push((await call()).statusCode);
        expect(statuses.slice(0, 10), name).toEqual(Array(10).fill(ok));
        expect(statuses[10], name).toBe(429);
      }
    } finally {
      await app.close();
    }
  });
});
