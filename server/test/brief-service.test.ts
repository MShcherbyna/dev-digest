/**
 * BriefService with in-memory fake ports and a scripted LLM: the generation
 * pipeline (facts -> prompt -> one structured call -> grounding -> store), the
 * error taxonomy (AC-24), the in-flight/late-result rules (AC-23, AC-35), the
 * log line and the input-budget wiring (plan 4.8).
 */
import { describe, it, expect, vi } from 'vitest';
import type { BlastRadius, Intent } from '@devdigest/shared';
import { BriefService } from '../src/modules/brief/service.js';
import { selectFiles } from '../src/modules/brief/helpers.js';
import { buildFactBlocks, loadBriefSystemPrompt } from '../src/modules/brief/prompt.js';
import {
  BRIEF_SCHEMA_NAME,
  INPUT_TARGET_TOKENS,
  OUTPUT_MAX_TOKENS,
  SPEC_DOC_BUDGET_TOKENS,
} from '../src/modules/brief/constants.js';
import type {
  BriefDeps,
  BriefFile,
  BriefFinding,
  BriefLog,
  BriefPull,
  BriefStore,
  SpecDocsInput,
} from '../src/modules/brief/ports.js';
import type { StoredBrief } from '../src/modules/brief/schemas.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { AppError, ConfigError, NotFoundError } from '../src/platform/errors.js';
import { classifyFile } from '../src/modules/reviews/smart-diff/classify.js';

const WS = 'ws-1';
const PR = 'pr-1';
const BODY_TEXT = 'PR_BODY_TEXT_do_not_log';
const CODE_SENTINEL = 'CODE_SENTINEL_do_not_send';

const PULL: BriefPull = {
  id: PR,
  repoId: 'repo-1',
  number: 482,
  title: 'Add rate limiting',
  body: BODY_TEXT,
  headSha: 'head-1',
  clonePath: '/clones/acme/api',
};

const FILES: BriefFile[] = [
  { path: 'src/limiter.ts', additions: 84, deletions: 3, patch: `@@ -1,2 +10,10 @@\n+${CODE_SENTINEL}` },
  { path: 'src/limiter.test.ts', additions: 20, deletions: 0, patch: '@@ -0,0 +1,20 @@\n+t' },
];

const BLAST: BlastRadius & { degraded: boolean; reason: string | null; ref_sha: string | null } = {
  changed_symbols: [{ name: 'limit', file: 'src/limiter.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'limit',
      callers: [{ name: 'handler', file: 'src/api/handler.ts', line: 41 }],
      endpoints_affected: ['GET /x'],
      crons_affected: [],
    },
  ],
  summary: '1 symbol · 1 caller',
  degraded: false,
  reason: null,
  ref_sha: 'abc',
};

const INTENT: Intent = { intent: 'Throttle public endpoints', in_scope: ['limiter'], out_of_scope: ['auth'] };

const OUTPUT = {
  summary: 'Adds a token-bucket limiter.',
  risks: [
    {
      kind: 'security',
      title: 'Bypass',
      explanation: 'Limiter can be bypassed.',
      severity: 'high',
      file_refs: ['src/limiter.ts:12', 'src/limiter.ts:999', 'src/ghost.ts:1'],
    },
  ],
  review_focus: [
    { file: 'src/limiter.ts', line: 12, reason: 'in hunk' },
    { file: 'src/limiter.ts', line: 500, reason: 'outside hunk' },
    { file: 'src/ghost.ts', line: 1, reason: 'unknown file' },
    { file: 'src/api/handler.ts', line: 41, reason: 'blast caller' },
  ],
};

/** Records every structured call; the handler decides what comes back. */
class ScriptedLLM extends MockLLMProvider {
  handler: (req: { messages: { role: string; content: string }[] }, n: number) => Promise<unknown> | unknown = () => OUTPUT;
  override async completeStructured<T>(req: Parameters<MockLLMProvider['completeStructured']>[0]) {
    this.calls.push({ method: 'completeStructured', req });
    const data = await this.handler(req as never, this.calls.length);
    return { data: data as T, model: req.model, tokensIn: 8_200, tokensOut: 1_300, costUsd: 0.014, raw: '', attempts: 1 };
  }
  get structured() {
    return this.calls.filter((c) => c.method === 'completeStructured');
  }
}

class FakeStore implements BriefStore {
  pull: BriefPull | undefined = PULL;
  files: BriefFile[] = FILES;
  filesError: Error | null = null;
  findings: BriefFinding[] = [];
  brief: StoredBrief | null = null;
  upserts: StoredBrief[] = [];
  async getPull(ws: string, id: string) {
    return ws === WS && id === PR ? this.pull : undefined;
  }
  async listFiles() {
    if (this.filesError) throw this.filesError;
    return this.files;
  }
  async latestReviewFindings() {
    return this.findings;
  }
  async getBrief() {
    return this.brief;
  }
  async upsertBrief(_id: string, brief: StoredBrief) {
    this.upserts.push(brief);
    this.brief = brief;
  }
}

interface Logged {
  level: 'info' | 'warn';
  obj: Record<string, unknown>;
  msg: string;
}

function setup(over: Partial<BriefDeps> = {}) {
  const store = new FakeStore();
  const llm = new ScriptedLLM('openai');
  const logs: Logged[] = [];
  const log: BriefLog = {
    info: (obj, msg) => logs.push({ level: 'info', obj, msg }),
    warn: (obj, msg) => logs.push({ level: 'warn', obj, msg }),
  };
  const docInputs: SpecDocsInput[] = [];
  const state = {
    intent: INTENT as Intent | null,
    intentError: null as Error | null,
    blast: BLAST as typeof BLAST | null,
    blastError: null as Error | null,
    docs: [] as { path: string; content: string }[],
    docsError: null as Error | null,
    intentCalls: 0,
  };
  const deps: BriefDeps = {
    store,
    intent: {
      get: async () => {
        state.intentCalls++;
        if (state.intentError) throw state.intentError;
        return state.intent;
      },
    },
    blast: {
      get: async () => {
        if (state.blastError) throw state.blastError;
        return state.blast!;
      },
    },
    specDocs: {
      resolveForBrief: async (input) => {
        docInputs.push(input);
        if (state.docsError) throw state.docsError;
        return { docs: state.docs, paths: state.docs.map((d) => d.path) };
      },
    },
    roleOf: classifyFile,
    llm: async () => llm,
    modelChoice: async () => ({ provider: 'openai', model: 'gpt-4.1' }),
    timeoutMs: 5_000,
    now: () => new Date('2026-10-12T10:00:00.000Z'),
    ...over,
  };
  const svc = new BriefService(deps);
  return { svc, store, llm, logs, log, state, docInputs, generate: () => svc.generate(WS, PR, log) };
}

const failure = async (p: Promise<unknown>): Promise<AppError> => {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected the promise to reject');
};

const userPrompt = (llm: ScriptedLLM): string => {
  const req = llm.structured[0]!.req as { messages: { role: string; content: string }[] };
  return req.messages.find((m) => m.role === 'user')!.content;
};

describe('BriefService.generate - happy path', () => {
  it('makes exactly one structured call, stores a grounded brief and logs one line without prompt text', async () => {
    // Catches: AC-1/2/8/19/36/37 - extra LLM calls, ungrounded items stored, code/PR text sent or logged.
    const t = setup();
    t.store.findings = [{ file: 'src/limiter.ts', line: 12, severity: 'CRITICAL', title: 'Hardcoded key' }];
    const brief = await t.generate();

    expect(t.llm.calls).toHaveLength(1);
    const req = t.llm.structured[0]!.req as Record<string, unknown> & { schema: unknown };
    expect(req).toMatchObject({
      model: 'gpt-4.1',
      schemaName: BRIEF_SCHEMA_NAME,
      temperature: 0,
      maxTokens: OUTPUT_MAX_TOKENS,
      maxRetries: 1,
      timeoutMs: 5_000,
    });
    expect(userPrompt(t.llm)).toContain('src/limiter.ts:12 | CRITICAL | Hardcoded key');
    expect(userPrompt(t.llm)).not.toContain(CODE_SENTINEL);

    expect(brief).toMatchObject({
      head_sha: 'head-1',
      generated_at: '2026-10-12T10:00:00.000Z',
      provider: 'openai',
      model: 'gpt-4.1',
      tokens_in: 8_200,
      tokens_out: 1_300,
      cost_usd: 0.014,
      spec_docs: [],
      truncated: false,
      files_total: 2,
      files_sent: 2,
      summary: OUTPUT.summary,
      history: { history: [] },
      intent: INTENT,
    });
    // grounding: unknown file and out-of-hunk lines gone, blast caller kept, refs reduced
    expect(brief.review_focus.map((f) => f.reason)).toEqual(['in hunk', 'blast caller']);
    expect(brief.risks.risks[0]!.file_refs).toEqual(['src/limiter.ts:12', 'src/limiter.ts']);
    // stored blast is the vendored shape only
    expect(Object.keys(brief.blast!).sort()).toEqual(['changed_symbols', 'downstream', 'summary']);
    expect(t.store.upserts).toEqual([brief]);

    // exactly one log line, structured, no prompt/PR text
    expect(t.logs).toHaveLength(1);
    const line = t.logs[0]!;
    expect(line).toMatchObject({ level: 'info', msg: 'brief: generated' });
    expect(line.obj).toMatchObject({
      pr_id: PR,
      provider: 'openai',
      model: 'gpt-4.1',
      tokens_in: 8_200,
      tokens_out: 1_300,
      cost_usd: 0.014,
      outcome: 'ok',
      intent_available: true,
      blast_available: true,
      spec_docs: 0,
      dropped: { risks: 0, risk_refs: 1, focus: 2 },
      files_sent: 2,
      files_total: 2,
      budget_trimmed: false,
    });
    expect(typeof line.obj.duration_ms).toBe('number');
    expect(line.obj.input_tokens_estimate as number).toBeGreaterThan(0);
    const serialized = JSON.stringify(t.logs);
    for (const secret of [BODY_TEXT, CODE_SENTINEL, PULL.title, 'Hardcoded key', INTENT.intent]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('reports a truncated selection when more than 200 files changed (AC-30)', async () => {
    // Catches: truncated/files_sent/files_total not following the real prompt selection.
    const t = setup();
    t.store.files = Array.from({ length: 250 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 1, deletions: 0, patch: null }));
    const brief = await t.generate();
    expect(brief).toMatchObject({ files_total: 250, files_sent: 200, truncated: true });
  });
});

describe('BriefService.generate - unavailable facts', () => {
  it('AC-4: a missing or unreadable stored intent gives intent: null, never a derivation', async () => {
    // Catches: the brief deriving (and paying for) an intent, or failing when none exists.
    const missing = setup();
    missing.state.intent = null;
    const b1 = await missing.generate();
    expect(b1.intent).toBeNull();
    expect(userPrompt(missing.llm)).toContain('INTENT UNAVAILABLE');
    expect(missing.llm.calls).toHaveLength(1);
    expect(missing.logs[0]!.obj.intent_available).toBe(false);

    const broken = setup();
    broken.state.intentError = new Error('db down');
    expect((await broken.generate()).intent).toBeNull();
  });

  it('AC-5: a blast error and a degraded blast both give blast: null and drop blast-only anchors (AC-37)', async () => {
    // Catches: a degraded/failed blast being stored or trusted to ground caller-line anchors.
    const thrown = setup();
    thrown.state.blastError = new Error('repo intel exploded');
    const b1 = await thrown.generate();
    expect(b1.blast).toBeNull();
    expect(userPrompt(thrown.llm)).toContain('BLAST RADIUS UNAVAILABLE');
    expect(b1.review_focus.map((f) => f.reason)).toEqual(['in hunk']);
    expect(thrown.logs[0]!.obj.blast_available).toBe(false);

    const degraded = setup();
    degraded.state.blast = { ...BLAST, degraded: true, reason: 'index_partial' };
    const b2 = await degraded.generate();
    expect(b2.blast).toBeNull();
    expect(userPrompt(degraded.llm)).not.toContain('src/api/handler.ts:41');
    expect(b2.review_focus.map((f) => f.reason)).toEqual(['in hunk']);
  });

  it('an empty file list or a file-read error is a provider_error with no LLM call and no write', async () => {
    // Catches: paying for a brief of nothing (Q3), or leaking a storage error as an unmapped 500.
    const empty = setup();
    empty.store.files = [];
    const e1 = await failure(empty.generate());
    expect(e1).toMatchObject({ code: 'provider_error', statusCode: 502 });
    expect(empty.llm.calls).toHaveLength(0);
    expect(empty.store.upserts).toHaveLength(0);

    const broken = setup();
    broken.store.filesError = new Error('connection refused');
    expect(await failure(broken.generate())).toMatchObject({ code: 'provider_error', statusCode: 502 });
  });
});

describe('BriefService.generate - error taxonomy (AC-9, AC-24)', () => {
  const existing = { head_sha: 'old', summary: 'previous brief' } as StoredBrief;

  it('invalid_output: a schema-breaking answer is 502, leaves the stored brief unchanged and logs a warning', async () => {
    // Catches: AC-9 - a bad model answer overwriting the stored brief or surfacing as an unmapped error.
    const t = setup();
    t.store.brief = existing;
    t.llm.handler = () => ({ ...OUTPUT, risks: [{ ...OUTPUT.risks[0], severity: 'critical' }] });
    const err = await failure(t.generate());
    expect(err).toMatchObject({ code: 'invalid_output', statusCode: 502 });
    expect(t.store.upserts).toHaveLength(0);
    expect(t.store.brief).toBe(existing);
    expect(t.logs).toHaveLength(1);
    expect(t.logs[0]).toMatchObject({ level: 'warn', msg: 'brief: generation failed' });
    expect(t.logs[0]!.obj).toMatchObject({ outcome: 'invalid_output', tokens_in: 8_200 });
    expect(typeof t.logs[0]!.obj.cause).toBe('string');
  });

  it('invalid_output: an adapter-thrown schema validation error maps the same way', async () => {
    // Catches: the real provider's "schema validation" throw being reported as a provider outage.
    const t = setup();
    t.llm.handler = () => {
      throw new Error('structured output failed schema validation after 2 attempts');
    };
    expect(await failure(t.generate())).toMatchObject({ code: 'invalid_output', statusCode: 502 });
  });

  it('provider_error: any other provider failure is a generic 502 with the cause only in details and the log', async () => {
    // Catches: the raw provider message becoming the user-facing message, or the stored brief changing.
    const t = setup();
    t.store.brief = existing;
    t.llm.handler = () => {
      throw new Error('upstream 503 overloaded');
    };
    const err = await failure(t.generate());
    expect(err).toMatchObject({ code: 'provider_error', statusCode: 502 });
    expect(err.message).not.toContain('503');
    expect(err.details).toEqual({ cause: 'upstream 503 overloaded' });
    expect(t.store.brief).toBe(existing);
    expect(t.logs[0]!.obj).toMatchObject({ outcome: 'provider_error', cause: 'upstream 503 overloaded' });
  });

  it('missing_api_key: a ConfigError from the provider factory is a 500 naming the provider, with no call', async () => {
    // Catches: the UI-actionable "add a key" error collapsing into a generic failure.
    const t = setup({
      llm: async () => {
        throw new ConfigError('OPENAI_API_KEY is not configured');
      },
    });
    const err = await failure(t.generate());
    expect(err).toMatchObject({ code: 'missing_api_key', statusCode: 500 });
    expect(err.message).toContain('openai');
    expect(err.message).toContain('Settings');
    expect(t.logs[0]!.obj).toMatchObject({ outcome: 'missing_api_key', provider: 'openai' });
    expect(t.store.upserts).toHaveLength(0);
  });

  it('a model that never answers times out as provider_error and frees the PR for a retry', async () => {
    // Catches: a hung provider holding the in-flight slot forever (every later POST would be 409).
    const t = setup({ timeoutMs: 25 });
    t.llm.handler = () => new Promise(() => undefined);
    const err = await failure(t.generate());
    expect(err).toMatchObject({ code: 'provider_error', statusCode: 502 });
    expect((await t.svc.getState(WS, PR)).generating).toBe(false);
    t.llm.handler = () => OUTPUT;
    expect((await t.generate()).summary).toBe(OUTPUT.summary);
  });

  it('AC-35: a late answer of a timed-out run is never persisted over a newer brief', async () => {
    // Catches: a stale, timed-out generation overwriting the brief of the retry that replaced it.
    const t = setup({ timeoutMs: 25 });
    let release!: () => void;
    let firstFinished!: () => void;
    const finished = new Promise<void>((r) => (firstFinished = r));
    t.llm.handler = async (_req, n) => {
      if (n === 1) {
        await new Promise<void>((r) => (release = r));
        firstFinished();
        return { ...OUTPUT, summary: 'LATE' };
      }
      return { ...OUTPUT, summary: 'SECOND' };
    };
    await failure(t.generate()); // times out
    const second = await t.generate();
    expect(second.summary).toBe('SECOND');
    release();
    await finished;
    await new Promise((r) => setImmediate(r));
    expect(t.store.upserts.map((b) => b.summary)).toEqual(['SECOND']);
    expect(t.store.brief!.summary).toBe('SECOND');
  });
});

describe('BriefService - lookup and in-flight rules (AC-18, AC-23)', () => {
  it('AC-18: an unknown or foreign PR is NotFound on both calls and never reaches the model', async () => {
    // Catches: generating (and paying) for a PR of another workspace.
    const t = setup();
    t.store.pull = undefined;
    expect(await failure(t.generate())).toBeInstanceOf(NotFoundError);
    expect(await failure(t.svc.getState(WS, PR))).toBeInstanceOf(NotFoundError);
    expect(await failure(setup().svc.generate('other-ws', PR, setup().log))).toMatchObject({ code: 'not_found', statusCode: 404 });
    expect(t.llm.calls).toHaveLength(0);
    expect(t.logs).toHaveLength(0);
  });

  it('AC-23: a concurrent generate is a 409 without a second call, and `generating` follows the run', async () => {
    // Catches: two paid generations for one PR, or a `generating` flag that never clears.
    const t = setup();
    let release!: () => void;
    t.llm.handler = async () => {
      await new Promise<void>((r) => (release = r));
      return OUTPUT;
    };
    const first = t.generate();
    await vi.waitFor(() => expect(t.llm.calls).toHaveLength(1));
    expect((await t.svc.getState(WS, PR)).generating).toBe(true);
    const err = await failure(t.generate());
    expect(err).toMatchObject({ code: 'generation_in_progress', statusCode: 409 });
    expect(t.llm.calls).toHaveLength(1);
    release();
    await first;
    expect((await t.svc.getState(WS, PR)).generating).toBe(false);
    expect(t.llm.calls).toHaveLength(1);
    expect(t.logs).toHaveLength(1); // the 409 is not logged as an attempt
  });

  it('a failed run clears the in-flight slot', async () => {
    // Catches: a failure path that skips the `finally` and locks the PR with 409.
    const t = setup();
    t.llm.handler = () => {
      throw new Error('boom');
    };
    await failure(t.generate());
    t.llm.handler = () => OUTPUT;
    await expect(t.generate()).resolves.toMatchObject({ summary: OUTPUT.summary });
  });

  it('getState reports stale from the head sha and never calls intent, blast or the model (AC-3, AC-22)', async () => {
    // Catches: GET doing generation-side work, or `stale` not following the PR head.
    const t = setup();
    expect(await t.svc.getState(WS, PR)).toEqual({ brief: null, stale: false, generating: false });
    await t.generate();
    t.state.intentCalls = 0;
    expect(await t.svc.getState(WS, PR)).toMatchObject({ stale: false });
    t.store.pull = { ...PULL, headSha: 'head-2' };
    const s = await t.svc.getState(WS, PR);
    expect(s.stale).toBe(true);
    expect(s.brief!.head_sha).toBe('head-1');
    expect(t.state.intentCalls).toBe(0);
    expect(t.llm.calls).toHaveLength(1);
  });
});

describe('BriefService.generate - input budget wiring (plan 4.8)', () => {
  const docOf = (i: number, tokens: number) => ({ path: `docs/d${i}.md`, content: 'd'.repeat(tokens * 4) });

  it('gives a small PR the full 8,000-token document budget and passes the repo, clone and floor settings', async () => {
    // Catches: the document budget being mis-derived (too small wastes context, too large breaks the NFR).
    const t = setup();
    await t.generate();
    expect(t.docInputs).toEqual([
      {
        workspaceId: WS,
        repoId: 'repo-1',
        clonePath: '/clones/acme/api',
        budgetTokens: SPEC_DOC_BUDGET_TOKENS,
        perDocOverheadTokens: 30,
        minDocTokens: 200,
      },
    ]);
  });

  it('shrinks the document budget to 11,000 minus the measured rest on a large PR', async () => {
    // Catches: F-2 - documents sized at a flat 8,000 regardless of how much the facts already use.
    const t = setup();
    t.store.files = Array.from({ length: 250 }, (_, i) => ({
      path: `src/${String(i).padStart(3, '0')}-${'x'.repeat(109)}.ts`,
      additions: 1,
      deletions: 0,
      patch: Array.from({ length: 30 }, (_, h) => `@@ -${h * 10 + 1},2 +${h * 10 + 1},3 @@\n+x`).join('\n'),
    }));
    t.state.intent = null;
    t.state.blast = null;
    t.state.blastError = new Error('x');
    await t.generate();

    const { selected, total } = selectFiles(t.store.files, classifyFile);
    const blocks = buildFactBlocks(
      { title: PULL.title, body: PULL.body, intent: null, blast: null, files: selected, filesTotal: total, findings: [] },
      await loadBriefSystemPrompt(),
    );
    const expected = Math.min(SPEC_DOC_BUDGET_TOKENS, INPUT_TARGET_TOKENS - blocks.restTokens);
    expect(expected).toBeLessThan(SPEC_DOC_BUDGET_TOKENS);
    expect(t.docInputs[0]!.budgetTokens).toBe(expected);
    expect(t.logs[0]!.obj.docs_budget_tokens).toBe(expected);
    expect(t.logs[0]!.obj.input_tokens_estimate as number).toBeLessThanOrEqual(INPUT_TARGET_TOKENS);
  });

  it('a resolver that returns too much is trimmed by the final guard, and only sent documents are recorded', async () => {
    // Catches: spec_docs listing documents the model never saw, or an over-budget prompt being sent.
    const t = setup();
    t.state.docs = Array.from({ length: 5 }, (_, i) => docOf(i, 3_000));
    const brief = await t.generate();
    expect(brief.spec_docs.length).toBeGreaterThan(0);
    expect(brief.spec_docs.length).toBeLessThan(5);
    expect(brief.spec_docs).toEqual(t.state.docs.slice(0, brief.spec_docs.length).map((d) => d.path));
    const prompt = userPrompt(t.llm);
    expect(prompt).toContain(`spec-doc:${brief.spec_docs[0]}`);
    expect(prompt).not.toContain('spec-doc:docs/d4.md');
    expect(t.logs[0]!.obj).toMatchObject({ budget_trimmed: true, spec_docs: brief.spec_docs.length });
    expect(t.logs[0]!.obj.input_tokens_estimate as number).toBeLessThanOrEqual(INPUT_TARGET_TOKENS);
  });

  it('a failing document resolver degrades to no documents instead of failing the brief', async () => {
    // Catches: a broken project-context clone read turning into a failed brief.
    const t = setup();
    t.state.docsError = new Error('clone gone');
    const brief = await t.generate();
    expect(brief.spec_docs).toEqual([]);
  });
});
