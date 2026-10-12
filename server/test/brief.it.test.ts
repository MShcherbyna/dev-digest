import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { BRIEF_FIXTURE, PATCH_SENTINEL, fakeBlastIntel, seedBriefPr } from './helpers/brief.js';
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
  console.warn('[brief] Docker not available — skipping integration tests.');
}

const INTENT_FIXTURE = { intent: 'x', in_scope: [], out_of_scope: [], risk_areas: [], model_confidence: 'medium' };

/**
 * The real `MockLLMProvider` (so a schema-breaking fixture throws "fixture
 * failed schema", as the real adapter's validation does), made holdable.
 */
class ControlledLLM extends MockLLMProvider {
  fixtures: Record<string, unknown> = { [BRIEF_SCHEMA_NAME]: BRIEF_FIXTURE };
  hold = false;
  failWith: Error | null = null;
  private waiters: (() => void)[] = [];
  constructor() {
    super('openai');
    // MockLLMProvider keeps `opts` by reference; point its fixtures at our mutable map.
    (this as unknown as { opts: { structuredBySchema: Record<string, unknown> } }).opts = {
      structuredBySchema: this.fixtures,
    };
  }
  override async completeStructured<T>(req: Parameters<MockLLMProvider['completeStructured']>[0]) {
    if (this.hold) {
      this.calls.push({ method: 'completeStructured', req });
      await new Promise<void>((r) => this.waiters.push(r));
      this.calls.pop();
    }
    if (this.failWith) {
      this.calls.push({ method: 'completeStructured', req });
      throw this.failWith;
    }
    return super.completeStructured<T>(req);
  }
  release() {
    this.hold = false;
    this.waiters.splice(0).forEach((r) => r());
  }
  reset() {
    this.release();
    this.failWith = null;
    this.fixtures[BRIEF_SCHEMA_NAME] = BRIEF_FIXTURE;
    this.calls = [];
  }
  get structuredCalls() {
    return this.calls.filter((c) => c.method === 'completeStructured').length;
  }
  get lastUserPrompt(): string {
    const req = this.calls.filter((c) => c.method === 'completeStructured').at(-1)!.req as {
      messages: { role: string; content: string }[];
    };
    return req.messages.find((m) => m.role === 'user')!.content;
  }
}

d('PR Brief routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const llm = new ControlledLLM();

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** Every LLM provider, secrets, GitHub, git and repo-intel are overridden (server INSIGHTS 2026-09-24). */
  async function makeApp(opts: { noKey?: boolean } = {}) {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ head: 'head-1' }),
        github: new MockGitHubClient(),
        repoIntel: fakeBlastIntel,
        priorPrs: new MockPriorPrSource(),
        repoDocs: new MockRepoDocsSource({}),
        secrets: new MockSecretsProvider({}),
        llm: opts.noKey
          ? {}
          : {
              openai: llm,
              anthropic: new MockLLMProvider('anthropic', { structured: INTENT_FIXTURE }),
              openrouter: new MockLLMProvider('openai', { structured: INTENT_FIXTURE }),
            },
      },
    });
  }
  type App = Awaited<ReturnType<typeof makeApp>>;

  const post = (app: App, id: string) => app.inject({ method: 'POST', url: `/pulls/${id}/brief/generate` });
  const get = (app: App, id: string) => app.inject({ method: 'GET', url: `/pulls/${id}/brief` });
  const rowText = async (prId: string) => {
    const r = await pg.handle.db.execute(sql`select json::text as j from pr_brief where pr_id = ${prId}`);
    return (r as unknown as { j: string }[])[0]?.j ?? null;
  };
  const rowCount = async (prId: string) =>
    (await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId))).length;
  const seedPr = (o: { files?: boolean; headSha?: string } = {}) => seedBriefPr(pg.handle.db, { workspaceId, ...o });

  it('AC-1/2/3/4/37: POST generates once from facts, replaces on regenerate, and GET reads it back', async () => {
    // Catches: the brief not persisted/readable, duplicate rows, code sent to the model, blast anchors ungrounded, an intent row created.
    llm.reset();
    const app = await makeApp();
    try {
      const { prId } = await seedPr();
      // latest review has one live and one dismissed finding; an older review and a 'summary' review must be ignored
      const db = pg.handle.db;
      const mkReview = async (kind: 'review' | 'summary', createdAt: string, titles: { title: string; dismissed?: boolean }[]) => {
        const [rev] = await db
          .insert(t.reviews)
          .values({ workspaceId, prId, kind, createdAt: new Date(createdAt), model: 'seed' })
          .returning();
        await db.insert(t.findings).values(
          titles.map((f, i) => ({
            reviewId: rev!.id,
            file: 'src/limiter.ts',
            startLine: 12 + i,
            endLine: 12 + i,
            severity: 'CRITICAL',
            category: 'security',
            title: f.title,
            rationale: 'r',
            confidence: 0.9,
            dismissedAt: f.dismissed ? new Date() : null,
          })),
        );
      };
      await mkReview('review', '2026-01-01T00:00:00Z', [{ title: 'OLD_REVIEW_FINDING' }]);
      await mkReview('review', '2026-02-01T00:00:00Z', [{ title: 'LATEST_FINDING' }, { title: 'DISMISSED_FINDING', dismissed: true }]);
      await mkReview('summary', '2026-03-01T00:00:00Z', [{ title: 'SUMMARY_KIND_FINDING' }]);

      expect(await get(app, prId).then((r) => r.json())).toEqual({ brief: null, stale: false, generating: false });

      const res = await post(app, prId);
      expect(res.statusCode).toBe(200);
      const brief = res.json().brief;
      expect(llm.structuredCalls).toBe(1);
      expect(brief).toMatchObject({
        head_sha: 'head-1',
        provider: 'openai',
        intent: null,
        history: { history: [] },
        files_total: 2,
        files_sent: 2,
        truncated: false,
        spec_docs: [],
      });
      // grounded: blast-only caller kept (blast available), ghost + out-of-hunk dropped, refs reduced
      expect(brief.review_focus.map((f: { reason: string }) => f.reason)).toEqual(['core of the limiter', 'blast caller line']);
      expect(brief.risks.risks[0].file_refs).toEqual(['src/limiter.ts:12', 'src/limiter.ts']);
      expect(brief.blast.downstream[0].callers).toEqual([{ name: 'run', file: 'src/api/handler.ts', line: 41 }]);
      expect(Object.keys(brief.blast).sort()).toEqual(['changed_symbols', 'downstream', 'summary']);

      // the prompt: latest live findings only, no patch code
      const prompt = llm.lastUserPrompt;
      expect(prompt).toContain('LATEST_FINDING');
      for (const absent of ['OLD_REVIEW_FINDING', 'DISMISSED_FINDING', 'SUMMARY_KIND_FINDING', PATCH_SENTINEL]) {
        expect(prompt).not.toContain(absent);
      }
      expect(prompt).toContain('INTENT UNAVAILABLE');
      // AC-4: no intent derived or stored
      expect(await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId))).toHaveLength(0);

      // AC-3: GET returns the same brief without another call
      const got = (await get(app, prId)).json();
      expect(got).toEqual({ brief, stale: false, generating: false });
      expect(llm.structuredCalls).toBe(1);

      // AC-2: regenerate replaces the single row
      llm.fixtures[BRIEF_SCHEMA_NAME] = { ...BRIEF_FIXTURE, summary: 'Second generation.' };
      const second = (await post(app, prId)).json().brief;
      expect(second.summary).toBe('Second generation.');
      expect(await rowCount(prId)).toBe(1);
      expect(JSON.parse((await rowText(prId))!)).toEqual(second);
      expect((await get(app, prId)).json().brief).toEqual(second);

      // AC-22: a moved PR head makes the stored brief stale, still readable
      await db.update(t.pullRequests).set({ headSha: 'head-2' }).where(eq(t.pullRequests.id, prId));
      const stale = (await get(app, prId)).json();
      expect(stale.stale).toBe(true);
      expect(stale.brief.head_sha).toBe('head-1');
    } finally {
      await app.close();
    }
  });

  it('AC-4: a stored intent is read into the brief and sent to the model', async () => {
    // Catches: the stored intent being ignored, or the mapping from the intent row to the vendored Intent shape breaking.
    llm.reset();
    const app = await makeApp();
    try {
      const { prId } = await seedPr();
      await pg.handle.db.insert(t.prIntent).values({
        prId,
        intent: 'Throttle public endpoints',
        inScope: ['limiter'],
        outOfScope: ['auth'],
        headSha: 'head-1',
      });
      const brief = (await post(app, prId)).json().brief;
      expect(brief.intent).toEqual({ intent: 'Throttle public endpoints', in_scope: ['limiter'], out_of_scope: ['auth'] });
      expect(llm.lastUserPrompt).toContain('intent: Throttle public endpoints');
      expect(llm.lastUserPrompt).not.toContain('INTENT UNAVAILABLE');
    } finally {
      await app.close();
    }
  });

  it('AC-9/AC-24: every failure cause gives its HTTP status and code and leaves the stored row byte-identical', async () => {
    // Catches: wrong status/code envelope per cause (F-4), or a failed run overwriting/deleting the previous brief.
    llm.reset();
    const app = await makeApp();
    try {
      const { prId } = await seedPr();
      expect((await post(app, prId)).statusCode).toBe(200);
      const before = await rowText(prId);
      expect(before).not.toBeNull();
      const callsBefore = llm.structuredCalls;

      // invalid output: the fixture breaks the output schema (bad severity)
      llm.fixtures[BRIEF_SCHEMA_NAME] = { ...BRIEF_FIXTURE, risks: [{ ...BRIEF_FIXTURE.risks[0], severity: 'critical' }] };
      let res = await post(app, prId);
      expect(res.statusCode).toBe(502);
      expect(res.json().error.code).toBe('invalid_output');
      expect(await rowText(prId)).toBe(before);

      // provider error: the model call throws
      llm.fixtures[BRIEF_SCHEMA_NAME] = BRIEF_FIXTURE;
      llm.failWith = new Error('upstream 503 overloaded');
      res = await post(app, prId);
      expect(res.statusCode).toBe(502);
      expect(res.json().error.code).toBe('provider_error');
      expect(res.json().error.message).not.toContain('503');
      expect(await rowText(prId)).toBe(before);
      llm.failWith = null;

      // no changed files: nothing to summarise, and the model is not called
      const empty = await seedPr({ files: false });
      const callsBeforeEmpty = llm.structuredCalls;
      res = await post(app, empty.prId);
      expect(res.statusCode).toBe(502);
      expect(res.json().error.code).toBe('provider_error');
      expect(llm.structuredCalls).toBe(callsBeforeEmpty);
      expect(await rowCount(empty.prId)).toBe(0);

      expect(llm.structuredCalls).toBe(callsBefore + 2);
      // after all failures GET still serves the original brief and nothing is stuck generating
      const got = (await get(app, prId)).json();
      expect(got.generating).toBe(false);
      expect(JSON.parse(before!)).toEqual(got.brief);
    } finally {
      await app.close();
    }
  });

  it('AC-24: without a provider key the POST is a 500 missing_api_key and stores nothing', async () => {
    // Catches: the missing-key case surfacing as an unmapped internal error (the UI links to Settings only for this code).
    llm.reset();
    const app = await makeApp({ noKey: true });
    try {
      const { prId } = await seedPr();
      const res = await post(app, prId);
      expect(res.statusCode).toBe(500);
      expect(res.json().error.code).toBe('missing_api_key');
      expect(res.json().error.message).toContain('openai');
      expect(await rowCount(prId)).toBe(0);
      expect((await get(app, prId)).json()).toEqual({ brief: null, stale: false, generating: false });
    } finally {
      await app.close();
    }
  });

  it('AC-18: an unknown PR and a PR of another workspace are 404 on GET and POST with zero model calls', async () => {
    // Catches: generating for, or reading the brief of, a PR outside the caller's workspace.
    llm.reset();
    const app = await makeApp();
    try {
      const [foreignWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'foreign' }).returning();
      const foreign = await seedBriefPr(pg.handle.db, { workspaceId: foreignWs!.id });
      for (const id of [foreign.prId, '00000000-0000-4000-8000-000000000000']) {
        for (const res of [await get(app, id), await post(app, id)]) {
          expect(res.statusCode).toBe(404);
          expect(res.json().error.code).toBe('not_found');
        }
      }
      expect((await get(app, 'not-a-uuid')).statusCode).toBe(422);
      expect(llm.structuredCalls).toBe(0);
      expect(await rowCount(foreign.prId)).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('AC-23: two concurrent POSTs give one 200 and one 409, one model call, and GET shows generating meanwhile', async () => {
    // Catches: the in-flight guard living per request instead of per container (double paid generation), or `generating` never exposed.
    llm.reset();
    llm.hold = true;
    const app = await makeApp();
    try {
      const { prId } = await seedPr();
      const first = post(app, prId);
      await expect.poll(() => llm.structuredCalls).toBe(1);
      const second = await post(app, prId);
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe('generation_in_progress');
      const mid = (await get(app, prId)).json();
      expect(mid).toEqual({ brief: null, stale: false, generating: true });
      llm.release();
      expect((await first).statusCode).toBe(200);
      expect(llm.structuredCalls).toBe(1);
      const after = (await get(app, prId)).json();
      expect(after.generating).toBe(false);
      expect(after.brief).not.toBeNull();
    } finally {
      llm.release();
      await app.close();
    }
  });

  it('AC-35: a client that disconnects mid-generation does not cancel it; the brief is stored and readable', async () => {
    // Catches: the request's abort signal reaching the service, losing a paid generation when the tab is closed.
    llm.reset();
    llm.hold = true;
    const app = await makeApp();
    try {
      const { prId } = await seedPr();
      await app.listen({ port: 0, host: '127.0.0.1' });
      const address = app.server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const controller = new AbortController();
      const request = fetch(`http://127.0.0.1:${port}/pulls/${prId}/brief/generate`, {
        method: 'POST',
        signal: controller.signal,
      }).catch((e: unknown) => e);
      await expect.poll(() => llm.structuredCalls).toBe(1);
      controller.abort();
      expect(await request).toMatchObject({ name: 'AbortError' });
      llm.release();
      await expect.poll(async () => (await get(app, prId)).json().brief !== null).toBe(true);
      const got = (await get(app, prId)).json();
      expect(got.brief.summary).toBe(BRIEF_FIXTURE.summary);
      expect(got.generating).toBe(false);
      expect(llm.structuredCalls).toBe(1);
    } finally {
      llm.release();
      await app.close();
    }
  });

  it('a stored row that no longer parses reads as no brief and is replaced by the next generation', async () => {
    // Catches: a legacy/corrupt pr_brief row turning GET into a 500 and blocking regeneration.
    llm.reset();
    const app = await makeApp();
    try {
      const { prId } = await seedPr();
      await pg.handle.db.insert(t.prBrief).values({ prId, json: { legacy: true } });
      expect((await get(app, prId)).json()).toEqual({ brief: null, stale: false, generating: false });
      const res = await post(app, prId);
      expect(res.statusCode).toBe(200);
      expect(await rowCount(prId)).toBe(1);
      expect((await get(app, prId)).json().brief).toEqual(res.json().brief);
    } finally {
      await app.close();
    }
  });
});
