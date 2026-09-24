import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const FIXTURE = {
  title: 'Жорстко закодований ключ',
  rationale: 'Ключ у коді.',
  suggestion: 'Використайте змінну.',
};

d('translation (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let findingA: string;
  let findingB: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'tr', fullName: 'acme/tr' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId, repoId: repo!.id, number: 1, title: 'T', author: 'a', branch: 'b', base: 'main',
        headSha: 'abc', additions: 1, deletions: 0, filesCount: 1, status: 'needs_review', body: '',
      })
      .returning();
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr!.id, kind: 'review' })
      .returning();
    const reviewId = review!.id;
    const rows = await db.insert(t.findings).values([
      { reviewId, file: 'a.ts', startLine: 1, endLine: 1, severity: 'CRITICAL', category: 'security', title: 'Hardcoded key', rationale: 'A key is committed.', suggestion: 'Use an env var.', confidence: 0.9 },
      { reviewId, file: 'b.ts', startLine: 2, endLine: 2, severity: 'WARNING', category: 'bug', title: 'No validation', rationale: 'Input is not validated.', suggestion: null, confidence: 0.8 },
    ]).returning();
    findingA = rows[0]!.id;
    findingB = rows[1]!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const translateCalls = (m: MockLLMProvider) =>
    m.calls.filter((c) => c.method === 'completeStructured').length;

  it('translates once, then serves from the DB; a new model or language re-translates', async () => {
    const llm = new MockLLMProvider('openai', { structured: FIXTURE });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { llm: { openrouter: llm } },
    });
    const post = (id = findingA) => app.inject({ method: 'POST', url: `/findings/${id}/translate` });

    const first = await post();
    expect(first.statusCode).toBe(200);
    expect(first.json().language).toBe('uk');
    expect(first.json().finding_id).toBe(findingA);
    expect(first.json().title).toBe('Жорстко закодований ключ');
    expect(translateCalls(llm)).toBe(1);

    // Same model + language + source → 0 LLM calls, same items.
    const second = await post();
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(translateCalls(llm)).toBe(1);

    // Another finding is translated independently (its own call, only that finding).
    expect((await post(findingB)).statusCode).toBe(200);
    expect(translateCalls(llm)).toBe(2);
    expect((await post(findingB)).statusCode).toBe(200);
    expect(translateCalls(llm)).toBe(2);

    // Another model → new call.
    await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { translation: { provider: 'openrouter', model: 'other/model' } } },
    });
    expect((await post()).statusCode).toBe(200);
    expect(translateCalls(llm)).toBe(3);
    expect((await post()).statusCode).toBe(200);
    expect(translateCalls(llm)).toBe(3);

    // Another language → new call.
    await app.inject({ method: 'PUT', url: '/settings', payload: { translation_language: 'ru' } });
    const ru = await post();
    expect(ru.json().language).toBe('ru');
    expect(translateCalls(llm)).toBe(4);

    await app.close();
  });

  it('404 for a finding outside the workspace, 502 translation_failed when the model fails', async () => {
    const llm = new MockLLMProvider('openai', { structured: { nope: true } });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { llm: { openrouter: llm } },
    });
    const missing = await app.inject({
      method: 'POST',
      url: '/findings/00000000-0000-4000-8000-000000000000/translate',
    });
    expect(missing.statusCode).toBe(404);

    // Reset to a fresh (model, language) so nothing is cached, then fail the model.
    await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: {
        translation_language: 'uk',
        feature_models: { translation: { provider: 'openrouter', model: 'fresh/model' } },
      },
    });
    const bad = await app.inject({ method: 'POST', url: `/findings/${findingA}/translate` });
    expect(bad.statusCode).toBe(502);
    expect(bad.json().error.code).toBe('translation_failed');
    await app.close();
  });
});
