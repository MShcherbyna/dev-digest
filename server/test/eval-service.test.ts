import { describe, it, expect } from 'vitest';
import type { Finding, LLMProvider } from '@devdigest/shared';
import { buildLineIndex, buildTaskLine, isFullFileKind } from '@devdigest/reviewer-core';
import { EvalService } from '../src/modules/eval/service.js';
import { DIFF_MAX_CHARS } from '../src/modules/eval/constants.js';
import { AppError, ConfigError } from '../src/platform/errors.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import type {
  AgentSnapshot,
  CaseOutcome,
  EvalAgent,
  EvalDeps,
  EvalLog,
  FindingCaseSource,
  InsertCaseResult,
  NewCase,
  ReviewEngineInput,
  ReviewEngineResult,
  RunFinalization,
  RunnableCase,
} from '../src/modules/eval/ports.js';
import type { EvalCase, ExpectedItem } from '../src/modules/eval/schemas.js';

// ---- fixtures ---------------------------------------------------------------

const WS = 'ws-1';
const AGENT_ID = 'agent-1';
const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk",\n   redisUrl: x,';
const CASE_DIFF = `diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n${PATCH}`;

const agent: EvalAgent = {
  id: AGENT_ID,
  name: 'Sec',
  enabled: true,
  version: 3,
  provider: 'openai',
  model: 'gpt-4.1',
  strategy: 'auto',
  systemPrompt: 'You review.',
};

const finding = (over: Partial<FindingCaseSource> = {}): FindingCaseSource => ({
  findingId: 'f-1',
  file: 'src/config.ts',
  startLine: 11,
  endLine: 11,
  severity: 'CRITICAL',
  category: 'security',
  title: 'Hardcoded Stripe secret key',
  kind: 'finding',
  acceptedAt: new Date('2026-01-02'),
  dismissedAt: null,
  agentId: AGENT_ID,
  agentExists: true,
  prId: 'pr-1',
  prTitle: 'Add rate limiting',
  prBody: 'Body text',
  patch: PATCH,
  ...over,
});

const kept = (file: string, start: number, end = start): Finding =>
  ({
    id: `${file}:${start}`,
    severity: 'WARNING',
    category: 'bug',
    title: 't',
    file,
    start_line: start,
    end_line: end,
    rationale: 'r',
    confidence: 0.9,
    kind: 'finding',
  }) as Finding;

const item = (over: Partial<ExpectedItem> = {}): ExpectedItem => ({
  expect: 'must_find',
  file: 'src/config.ts',
  start_line: 11,
  ...over,
});

const body = (over: Record<string, unknown> = {}) => ({
  name: 'case',
  input_diff: CASE_DIFF,
  input_meta: { title: 'PR title', body: 'PR body' },
  expected_output: [item()],
  notes: null,
  ...over,
});

function caseRow(c: NewCase, id: string): EvalCase {
  return {
    id,
    agent_id: c.agentId,
    name: c.name,
    origin: c.origin,
    input_diff: c.inputDiff,
    input_meta: c.inputMeta,
    expected_output: c.expectedOutput,
    notes: c.notes,
    source_finding_id: c.sourceFindingId,
    source_pr_id: c.sourcePrId,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    latest_result: null,
  };
}

// ---- in-memory fake ports ----------------------------------------------------

interface World {
  finding?: FindingCaseSource | undefined;
  agent?: EvalAgent | undefined;
  cases: Map<string, EvalCase>;
  existingForFinding: string | null;
  insertRace: boolean;
  activeRunId: string | null;
  insertRunActive: boolean;
  caseRunning: string | null;
  runExists: boolean[]; // consumed one per check; last value repeats
  deletedCaseIds: Set<string>;
  llmError: Error | null;
  engine: (i: ReviewEngineInput) => Promise<ReviewEngineResult>;
  recorded: Array<{ caseId: string; outcome: CaseOutcome }>;
  finalized: RunFinalization[];
  singleFinished: Array<{ resultId: string; outcome: CaseOutcome }>;
  snapshots: AgentSnapshot[];
  engineCalls: ReviewEngineInput[];
  llmCalls: string[];
  logs: Array<{ obj: Record<string, unknown>; msg: string }>;
  done: Promise<void>;
  signalDone: () => void;
}

function makeWorld(over: Partial<World> = {}): World {
  let signalDone!: () => void;
  const done = new Promise<void>((r) => (signalDone = r));
  const w: World = {
    finding: finding(),
    agent,
    cases: new Map(),
    existingForFinding: null,
    insertRace: false,
    activeRunId: null,
    insertRunActive: false,
    caseRunning: null,
    runExists: [true],
    deletedCaseIds: new Set(),
    llmError: null,
    engine: async () => ({ kept: [], dropped: 0, costUsd: 0.01 }),
    recorded: [],
    finalized: [],
    singleFinished: [],
    snapshots: [],
    engineCalls: [],
    llmCalls: [],
    logs: [],
    done,
    signalDone,
    ...over,
  };
  return w;
}

const log = (w: World): EvalLog => ({
  info: (obj, msg) => void w.logs.push({ obj, msg }),
  warn: (obj, msg) => void w.logs.push({ obj, msg }),
});

function makeService(w: World, runnable: RunnableCase[] = []) {
  let n = 0;
  const runExistsQueue = [...w.runExists];
  const deps: EvalDeps = {
    cases: {
      insertCase: async (_ws, input): Promise<InsertCaseResult> => {
        if (w.insertRace) return { kind: 'exists', caseId: 'raced-case' };
        const c = caseRow(input, `case-${++n}`);
        w.cases.set(c.id, c);
        return { kind: 'created', case: c };
      },
      updateCase: async () => undefined,
      getCase: async (_ws, id) =>
        w.deletedCaseIds.has(id)
          ? undefined
          : (w.cases.get(id) ?? (runnable.some((r) => r.id === id) ? ({ id } as EvalCase) : undefined)),
      listCases: async () => [],
      countCases: async () => runnable.length,
      runnableCases: async () => runnable,
      caseIdForFinding: async () => w.existingForFinding,
      deleteCase: async () => false,
    },
    runs: {
      startCaseResult: async () =>
        w.caseRunning
          ? { kind: 'running', resultId: w.caseRunning }
          : { kind: 'started', resultId: 'res-1' },
      finishCaseResult: async (resultId, outcome) => {
        w.singleFinished.push({ resultId, outcome });
        w.signalDone();
        return true;
      },
      insertAgentRun: async (_ws, _a, snapshot) => {
        w.snapshots.push(snapshot);
        return w.insertRunActive ? { kind: 'active_exists', runId: 'run-race' } : { kind: 'created', runId: 'run-1' };
      },
      getAgentRun: async () => undefined,
      listRunResults: async () => [],
      listAgentRuns: async () => [],
      activeRunId: async () => w.activeRunId,
      runExists: async () => (runExistsQueue.length > 1 ? runExistsQueue.shift()! : runExistsQueue[0]!),
      recordCaseResult: async (_run, caseId, outcome) => {
        w.recorded.push({ caseId, outcome });
        return true;
      },
      finalizeRun: async (_run, fin) => {
        w.finalized.push(fin);
        w.signalDone();
        return true;
      },
      reapStale: async () => ({ runs: 0, results: 0 }),
    },
    findings: { findingForCase: async () => w.finding },
    agents: {
      list: async () => (w.agent ? [w.agent] : []),
      get: async () => w.agent,
      enabledSkillIds: async () => ['skill-a'],
    },
    dashboard: { dashboardAgents: async () => [], recentFinishedRuns: async () => [] },
    configs: { isCurrentConfig: async () => ({ available: true, current: true }) },
    engine: async (input) => {
      w.engineCalls.push(input);
      return w.engine(input);
    },
    parseDiff: parseUnifiedDiff,
    lineIndex: buildLineIndex,
    isFullFileKind,
    taskLine: buildTaskLine,
    llm: async (provider) => {
      w.llmCalls.push(provider);
      if (w.llmError) throw w.llmError;
      return new MockLLMProvider('openai') as unknown as LLMProvider;
    },
    isConfigError: (e) => e instanceof ConfigError,
  };
  return new EvalService(deps);
}

async function failure(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected rejection');
}

const runnableCase = (id: string, expected: ExpectedItem[]): RunnableCase => ({
  id,
  name: id,
  inputDiff: CASE_DIFF,
  inputMeta: { title: 'PR title', body: 'PR body' },
  expectedOutput: expected,
});

// ---- tests -------------------------------------------------------------------

describe('EvalService.createFromFinding', () => {
  it('accepted finding becomes a must_find case with diff, PR meta, slug name and source links', async () => {
    // Regression: the case must be a faithful, frozen snapshot of the decision (AC-3..AC-6).
    const w = makeWorld();
    const c = await makeService(w).createFromFinding(WS, 'f-1');
    expect(c).toMatchObject({
      origin: 'finding',
      name: 'hardcoded-stripe-secret-key',
      source_finding_id: 'f-1',
      source_pr_id: 'pr-1',
      input_meta: { title: 'Add rate limiting', body: 'Body text' },
      expected_output: [
        { expect: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11, severity: 'CRITICAL', category: 'security' },
      ],
    });
    expect(c.input_diff).toBe(CASE_DIFF);
  });

  it('dismissed finding becomes must_not_flag; a later accept wins over an earlier dismiss', async () => {
    // Regression: a flipped decision (E-2) must use the latest decision, not just "dismissed exists".
    const dismissed = makeWorld({ finding: finding({ acceptedAt: null, dismissedAt: new Date('2026-01-03') }) });
    expect((await makeService(dismissed).createFromFinding(WS, 'f-1')).expected_output[0]?.expect).toBe('must_not_flag');

    const flipped = makeWorld({
      finding: finding({ acceptedAt: new Date('2026-01-05'), dismissedAt: new Date('2026-01-03') }),
    });
    expect((await makeService(flipped).createFromFinding(WS, 'f-1')).expected_output[0]?.expect).toBe('must_find');
  });

  it('rejects with the right status/code: 404 unknown, 422 undecided / agent_missing / diff_unavailable / range_outside_diff, 409 exists', async () => {
    // Regression: each failure branch must keep its code and status (client maps them to messages).
    const code = async (over: Partial<World>) => {
      const e = await failure(makeService(makeWorld(over)).createFromFinding(WS, 'f-1'));
      return [e.statusCode, e.code, e.details] as const;
    };
    expect(await code({ finding: undefined })).toEqual([404, 'not_found', undefined]);
    expect(await code({ finding: finding({ acceptedAt: null, dismissedAt: null }) })).toEqual([422, 'undecided', undefined]);
    expect(await code({ finding: finding({ agentId: null }) })).toEqual([422, 'agent_missing', undefined]);
    expect(await code({ finding: finding({ agentExists: false }) })).toEqual([422, 'agent_missing', undefined]);
    expect(await code({ finding: finding({ patch: null }) })).toEqual([422, 'diff_unavailable', undefined]);
    expect(await code({ finding: finding({ startLine: 500, endLine: 510 }) })).toEqual([422, 'range_outside_diff', undefined]);
    expect(await code({ existingForFinding: 'case-old' })).toEqual([409, 'eval_case_exists', { case_id: 'case-old' }]);
    // The unique-index race path reports the winner's id too.
    expect(await code({ insertRace: true })).toEqual([409, 'eval_case_exists', { case_id: 'raced-case' }]);
  });

  it('full-file kinds skip the hunk check (secret_leak outside any hunk is accepted)', async () => {
    // Regression: E-10, grounding keeps these when the file is in the diff, so the case must too.
    const w = makeWorld({ finding: finding({ kind: 'secret_leak', startLine: 500, endLine: 500 }) });
    const c = await makeService(w).createFromFinding(WS, 'f-1');
    expect(c.expected_output[0]).toMatchObject({ start_line: 500 });
  });
});

describe('EvalService create/update validation (AC-10/11)', () => {
  it('createCase: diff_too_large, diff_unparsable, expectation_outside_diff {index}; OK path stores a manual case', async () => {
    // Regression: the client reads details.index to point at the offending item.
    const svc = makeService(makeWorld());
    const e1 = await failure(svc.createCase(WS, AGENT_ID, body({ input_diff: 'x'.repeat(DIFF_MAX_CHARS + 1) }) as never));
    expect([e1.statusCode, e1.code]).toEqual([422, 'diff_too_large']);

    const e2 = await failure(svc.createCase(WS, AGENT_ID, body({ input_diff: 'not a diff' }) as never));
    expect([e2.statusCode, e2.code]).toEqual([422, 'diff_unparsable']);

    const e3 = await failure(
      svc.createCase(WS, AGENT_ID, body({ expected_output: [item(), item({ start_line: 900 })] }) as never),
    );
    expect([e3.statusCode, e3.code, e3.details]).toEqual([422, 'expectation_outside_diff', { index: 1 }]);

    // A must_not_flag item outside the diff is allowed.
    const ok = await svc.createCase(
      WS,
      AGENT_ID,
      body({ expected_output: [item(), item({ expect: 'must_not_flag', file: 'elsewhere.ts', start_line: 9 })] }) as never,
    );
    expect(ok).toMatchObject({ origin: 'manual', source_finding_id: null, source_pr_id: null });
  });

  it('createCase for an unknown agent is 404 before any validation', async () => {
    const e = await failure(makeService(makeWorld({ agent: undefined })).createCase(WS, 'nope', body() as never));
    expect([e.statusCode, e.code]).toEqual([404, 'not_found']);
  });
});

describe('EvalService run start', () => {
  it('startAgentRun: 404 unknown agent, 409 active (with id), 422 no_cases, 409 on insert race', async () => {
    // Regression: P1-AC-17, only one active run per agent; the race must not produce a second run.
    const some = [runnableCase('c1', [item()])];
    expect((await failure(makeService(makeWorld({ agent: undefined }), some).startAgentRun(WS, 'x', log(makeWorld())))).statusCode).toBe(404);

    const active = await failure(makeService(makeWorld({ activeRunId: 'run-9' }), some).startAgentRun(WS, AGENT_ID, log(makeWorld())));
    expect([active.statusCode, active.code, active.details]).toEqual([409, 'eval_run_active', { eval_run_id: 'run-9' }]);

    const none = await failure(makeService(makeWorld(), []).startAgentRun(WS, AGENT_ID, log(makeWorld())));
    expect([none.statusCode, none.code]).toEqual([422, 'no_cases']);

    const race = await failure(makeService(makeWorld({ insertRunActive: true }), some).startAgentRun(WS, AGENT_ID, log(makeWorld())));
    expect([race.statusCode, race.code, race.details]).toEqual([409, 'eval_run_active', { eval_run_id: 'run-race' }]);
  });

  it('startAgentRun returns 202 body and snapshots the agent config incl. enabled skill ids', async () => {
    // Regression: E-11 the run must use the config at start, not later edits.
    const w = makeWorld();
    const res = await makeService(w, [runnableCase('c1', [item()])]).startAgentRun(WS, AGENT_ID, log(w));
    expect(res).toEqual({ eval_run_id: 'run-1', status: 'running', cases_total: 1 });
    await w.done;
    expect(w.snapshots[0]).toEqual({
      agentVersion: 3,
      provider: 'openai',
      model: 'gpt-4.1',
      strategy: 'auto',
      systemPrompt: 'You review.',
      skillIds: ['skill-a'],
    });
  });

  it('startCaseRun: 409 eval_case_running carries result_id; otherwise 202 result id and the result is finished', async () => {
    const mk = (over: Partial<World>) => {
      const w = makeWorld(over);
      const svc = makeService(w);
      return { w, svc };
    };
    const a = mk({});
    const created = await a.svc.createCase(WS, AGENT_ID, body() as never);
    const started = await a.svc.startCaseRun(WS, created.id, log(a.w));
    expect(started).toEqual({ result_id: 'res-1' });
    await a.w.done;
    expect(a.w.singleFinished[0]?.outcome).toMatchObject({ errored: false, pass: false });

    const b = mk({ caseRunning: 'res-busy' });
    const bc = await b.svc.createCase(WS, AGENT_ID, body() as never);
    const err = await failure(b.svc.startCaseRun(WS, bc.id, log(b.w)));
    expect([err.statusCode, err.code, err.details]).toEqual([409, 'eval_case_running', { result_id: 'res-busy' }]);
    expect(b.w.engineCalls).toHaveLength(0);
  });
});

describe('EvalExecutor via EvalService.startAgentRun', () => {
  const three = [
    runnableCase('c1', [item()]),
    runnableCase('c2', [item()]),
    runnableCase('c3', [item({ expect: 'must_not_flag' })]),
  ];

  it('engine input carries only case diff, task line and PR body (no skills/memory/repo context)', async () => {
    // Regression: P1-AC-16, runs must be reproducible from the case alone.
    const w = makeWorld();
    await makeService(w, [three[0]!]).startAgentRun(WS, AGENT_ID, log(w));
    await w.done;
    const call = w.engineCalls[0]!;
    expect(Object.keys(call).sort()).toEqual(['diff', 'llm', 'model', 'prDescription', 'sessionId', 'strategy', 'systemPrompt', 'task']);
    expect(call.task).toBe(buildTaskLine({ title: 'PR title' }));
    expect(call.prDescription).toBe('PR body');
    expect(call.systemPrompt).toBe('You review.');
    expect(call.diff.files.map((f) => f.path)).toEqual(['src/config.ts']);
  });

  it('one engine failure of three => partial; metrics over the two executed cases; error reason kept', async () => {
    // Regression: P1-AC-19, an errored case must not abort the run or dilute metrics.
    let n = 0;
    const w = makeWorld({
      engine: async () => {
        n++;
        if (n === 2) throw new Error('provider exploded');
        return { kept: n === 1 ? [kept('src/config.ts', 11)] : [], dropped: 1, costUsd: 0.5 };
      },
    });
    await makeService(w, three).startAgentRun(WS, AGENT_ID, log(w));
    await w.done;
    expect(w.recorded.map((r) => [r.caseId, r.outcome.errored])).toEqual([
      ['c1', false],
      ['c2', true],
      ['c3', false],
    ]);
    expect(w.recorded[1]?.outcome.errorReason).toBe('provider exploded');
    expect(w.finalized[0]).toMatchObject({
      status: 'partial',
      casesExecuted: 2,
      casesErrored: 1,
      casesPassed: 2, // c1 hit; c3 (must_not_flag) with no findings passes
      recall: 1,
      precision: 1,
      citationAccuracy: 1 / 3, // kept 1 (c1) + 0 (c3) vs dropped 1 + 1; errored c2 excluded
      costUsd: 1,
    });
  });

  it('missing API key: every case errors with missing_api_key, run failed, engine never called', async () => {
    // Regression: E-13, no LLM call and a readable reason instead of N provider errors.
    const w = makeWorld({ llmError: new ConfigError('no key') });
    await makeService(w, three).startAgentRun(WS, AGENT_ID, log(w));
    await w.done;
    expect(w.engineCalls).toHaveLength(0);
    expect(w.llmCalls).toEqual(['openai']); // resolved once, not per case
    expect(w.recorded.every((r) => r.outcome.errored && r.outcome.errorReason === 'missing_api_key')).toBe(true);
    expect(w.finalized[0]).toMatchObject({ status: 'failed', reason: 'missing_api_key', recall: null, precision: null, citationAccuracy: null, costUsd: null });
  });

  it('agent deleted mid-run: the executor stops, runs no more cases and does not finalize', async () => {
    // Regression: E-12, a deleted agent's run must stop quietly (no writes to a vanished run).
    const w = makeWorld({ runExists: [true, false] });
    const svc = makeService(w, three);
    await svc.startAgentRun(WS, AGENT_ID, log(w));
    await waitUntil(() => w.logs.some((l) => l.obj.reason === 'agent_deleted'));
    expect(w.engineCalls).toHaveLength(1);
    expect(w.finalized).toHaveLength(0);
  });

  it('a case deleted mid-run is an error (case_deleted) without calling the engine for it', async () => {
    const w = makeWorld({ deletedCaseIds: new Set(['c2']) });
    const svc = makeService(w, three);
    await svc.startAgentRun(WS, AGENT_ID, log(w));
    await w.done;
    const byCase = Object.fromEntries(w.recorded.map((r) => [r.caseId, r.outcome.errorReason]));
    expect(byCase).toEqual({ c1: null, c2: 'case_deleted', c3: null });
    expect(w.engineCalls).toHaveLength(2);
    expect(w.finalized[0]?.status).toBe('partial');
  });

  it('logs never contain diff, PR body, prompt or finding text', async () => {
    // Regression: P1-NFR logging, content must not leak into logs.
    const w = makeWorld({ engine: async () => ({ kept: [kept('src/config.ts', 11)], dropped: 0, costUsd: 0 }) });
    await makeService(w, [three[0]!]).startAgentRun(WS, AGENT_ID, log(w));
    await w.done;
    const dump = JSON.stringify(w.logs);
    for (const secret of ['stripeKey', 'PR body', 'You review.', 'rationale']) expect(dump).not.toContain(secret);
  });
});

/** Bounded poll for background (fire-and-forget) work; no fixed sleeps. */
async function waitUntil(pred: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((r) => setImmediate(r));
  }
}
