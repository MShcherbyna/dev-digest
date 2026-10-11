/** OnboardingService with in-memory fake ports (no DB, no network): AC-3, AC-4, AC-5, AC-34, timeout, log line. */
import { describe, it, expect, vi } from 'vitest';
import { OnboardingService } from '../src/modules/onboarding/service.js';
import type {
  IndexFacts,
  OnboardingDeps,
  OnboardingLog,
  OnboardingStore,
  RepoLocation,
} from '../src/modules/onboarding/ports.js';
import type { OnboardingTour, TourModelOutput } from '../src/modules/onboarding/schemas.js';
import { MockLLMProvider, MockRepoFiles, type MockRepoTree } from '../src/adapters/mocks.js';
import { AppError, ConfigError } from '../src/platform/errors.js';

const WS = 'ws-1';
const REPO: RepoLocation = {
  id: 'repo-1',
  owner: 'acme',
  name: 'demo',
  fullName: 'acme/demo',
  defaultBranch: 'main',
  clonePath: '/clone/acme/demo',
};
const TREE: MockRepoTree = {
  'package.json': JSON.stringify({ scripts: { dev: 'x' } }),
  'README.md': '# SECRET-README-TEXT',
  'src/real.ts': 'export {}',
};
const OUTPUT: TourModelOutput = {
  architecture: {
    summary: 'See `src/real.ts` and `src/ghost.ts`.',
    nodes: [{ id: 'a', label: 'A', kind: 'service' }],
    edges: [],
  },
  critical_paths: [
    { path: 'src/real.ts', description: 'core' },
    { path: 'src/ghost.ts', description: 'hallucinated' },
  ],
  run_locally: [{ command: 'pnpm dev' }, { command: 'pnpm start:prod' }],
  reading_path: [{ path: 'README.md', reason: 'start' }],
  first_tasks: [{ title: 'Tweak', path: 'src/real.ts', complexity: 'low' }],
};

/** LLM whose completeStructured can be gated: `hold` makes calls wait on `release()`. */
class GatedLLM extends MockLLMProvider {
  private waiters: (() => void)[] = [];
  public hold = false;
  public never = false;
  public failWith: Error | null = null;
  public data: unknown = OUTPUT;
  override async completeStructured<T>(req: Parameters<MockLLMProvider['completeStructured']>[0]) {
    this.calls.push({ method: 'completeStructured', req });
    if (this.never) await new Promise(() => undefined);
    if (this.hold) await new Promise<void>((r) => this.waiters.push(r));
    if (this.failWith) throw this.failWith;
    return {
      data: this.data as T,
      model: req.model,
      tokensIn: 10,
      tokensOut: 5,
      costUsd: 0,
      raw: '',
      attempts: 1,
    };
  }
  release() {
    this.hold = false;
    this.waiters.splice(0).forEach((r) => r());
  }
  get structuredCalls() {
    return this.calls.filter((c) => c.method === 'completeStructured').length;
  }
}

function setup(over: { tree?: MockRepoTree | null; timeoutMs?: number; llmFactoryError?: Error } = {}) {
  const llm = new GatedLLM('openai');
  const tours = new Map<string, OnboardingTour>();
  const upsert = vi.fn(async (id: string, tour: OnboardingTour) => {
    tours.set(id, tour);
  });
  const store: OnboardingStore = {
    getRepo: async (ws, id) => (ws === WS && id === REPO.id ? REPO : undefined),
    getTour: async (id) => tours.get(id) ?? null,
    upsertTour: upsert,
  };
  const index: IndexFacts = {
    getIndexState: async () => ({
      status: 'full',
      filesIndexed: 7,
      lastIndexedSha: 'sha-indexed',
      updatedAt: new Date('2026-01-01'),
    }),
    getTopFilesByRank: async () => ['src/real.ts'],
    getCriticalPaths: async () => [],
  };
  const deps: OnboardingDeps = {
    store,
    files: new MockRepoFiles(over.tree === undefined ? TREE : over.tree),
    index,
    head: { currentHead: async () => 'sha-head' },
    llm: async () => {
      if (over.llmFactoryError) throw over.llmFactoryError;
      return llm;
    },
    modelChoice: async () => ({ provider: 'openrouter', model: 'm' }),
    timeoutMs: over.timeoutMs ?? 5000,
    now: () => new Date('2026-02-02T00:00:00Z'),
  };
  const log = { info: vi.fn(), warn: vi.fn() } satisfies OnboardingLog;
  return { svc: new OnboardingService(deps), llm, upsert, tours, log };
}

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected rejection');
};

describe('OnboardingService.generate', () => {
  it('grounds the model output against the clone and stores it', async () => {
    // Catches: ungrounded model paths/commands reaching the stored tour; wrong commit_sha source.
    const { svc, upsert } = setup();
    const tour = await svc.generate(WS, REPO.id, { info: vi.fn(), warn: vi.fn() });
    expect(tour.critical_paths.map((p) => p.path)).toEqual(['src/real.ts']);
    expect(tour.run_locally).toEqual([{ command: 'pnpm dev' }]);
    expect(tour.commit_sha).toBe('sha-indexed');
    expect(tour.partial_index).toBe(false);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect((await svc.getState(WS, REPO.id)).tour).toEqual(tour);
  });

  it('AC-3: two concurrent generates give one success and one 409; one LLM call', async () => {
    // Catches: a double-click starting two paid generations that race to overwrite each other.
    const { svc, llm, log } = setup();
    llm.hold = true;
    const a = svc.generate(WS, REPO.id, log);
    const b = svc.generate(WS, REPO.id, log);
    const errB = await failure(b);
    expect(errB.statusCode).toBe(409);
    expect(errB.code).toBe('generation_in_progress');
    await vi.waitFor(() => expect(llm.structuredCalls).toBe(1));
    expect((await svc.getState(WS, REPO.id)).generating).toBe(true);
    llm.release();
    await expect(a).resolves.toBeTruthy();
    expect(llm.structuredCalls).toBe(1);
    expect((await svc.getState(WS, REPO.id)).generating).toBe(false);
  });

  it('AC-4: no clone gives 409 not_cloned with zero LLM calls and no log line', async () => {
    // Catches: spending an LLM call (or logging a failed attempt) when there is nothing to read.
    const { svc, llm, upsert, log } = setup({ tree: null });
    const err = await failure(svc.generate(WS, REPO.id, log));
    expect([err.statusCode, err.code]).toEqual([409, 'not_cloned']);
    expect(llm.calls).toHaveLength(0);
    expect(upsert).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('AC-5: each failure cause maps to its code and leaves the store untouched', async () => {
    // Catches: a failed regeneration wiping/overwriting the previous tour, or a wrong error code reaching the UI.
    const missingKey = setup({ llmFactoryError: new ConfigError('no key') });
    const e1 = await failure(missingKey.svc.generate(WS, REPO.id, missingKey.log));
    expect([e1.statusCode, e1.code]).toEqual([500, 'missing_api_key']);

    const provider = setup();
    provider.llm.failWith = new Error('upstream 503');
    const e2 = await failure(provider.svc.generate(WS, REPO.id, provider.log));
    expect([e2.statusCode, e2.code]).toEqual([502, 'provider_error']);

    const schemaMsg = setup();
    schemaMsg.llm.failWith = new Error('Structured output failed schema validation after retry');
    const e3 = await failure(schemaMsg.svc.generate(WS, REPO.id, schemaMsg.log));
    expect(e3.code).toBe('invalid_output');

    const badData = setup();
    badData.llm.data = { ...OUTPUT, architecture: { ...OUTPUT.architecture, summary: '' } };
    const e4 = await failure(badData.svc.generate(WS, REPO.id, badData.log));
    expect(e4.code).toBe('invalid_output');

    for (const s of [missingKey, provider, schemaMsg, badData]) {
      expect(s.upsert).not.toHaveBeenCalled();
      expect(s.log.warn).toHaveBeenCalledTimes(1);
      expect(s.log.info).not.toHaveBeenCalled();
    }
  });

  it('timeout: a never-resolving LLM gives provider_error, frees the slot, and a late result is not persisted', async () => {
    // Catches: a stuck generation blocking the repo forever, or a timed-out run overwriting a newer tour.
    const { svc, llm, upsert, log } = setup({ timeoutMs: 50 });
    llm.never = true;
    const err = await failure(svc.generate(WS, REPO.id, log));
    expect([err.statusCode, err.code]).toEqual([502, 'provider_error']);
    expect((await svc.getState(WS, REPO.id)).generating).toBe(false);
    expect(upsert).not.toHaveBeenCalled();

    // immediate retry is accepted
    llm.never = false;
    const retry = await svc.generate(WS, REPO.id, log);
    expect(retry.commit_sha).toBe('sha-indexed');
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('timeout: the abandoned run finishing later never calls upsertTour', async () => {
    // Catches: the token guard missing - a late run persisting after its deadline already reported failure.
    const { svc, llm, upsert, log } = setup({ timeoutMs: 50 });
    llm.hold = true;
    const err = await failure(svc.generate(WS, REPO.id, log));
    expect(err.code).toBe('provider_error');
    llm.release(); // the abandoned run now resolves successfully
    await new Promise((r) => setTimeout(r, 30));
    expect(upsert).not.toHaveBeenCalled();
  });

  it('AC-34: the caller dropping the promise does not stop the generation from being stored', async () => {
    // Catches: a closed browser tab / aborted request cancelling the work so the tour never appears.
    const { svc, llm, upsert, log } = setup();
    llm.hold = true;
    void svc.generate(WS, REPO.id, log).catch(() => undefined); // nobody awaits
    await vi.waitFor(() => expect(llm.structuredCalls).toBe(1));
    expect(upsert).not.toHaveBeenCalled();
    llm.release();
    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
  });

  it('log line: exactly one per attempt with the required fields and no prompt text', async () => {
    // Catches: double logging, missing observability fields, or repo content / secrets leaking into logs.
    const ok = setup();
    await ok.svc.generate(WS, REPO.id, ok.log);
    expect(ok.log.info).toHaveBeenCalledTimes(1);
    expect(ok.log.warn).not.toHaveBeenCalled();
    const [line] = ok.log.info.mock.calls[0]!;
    expect(line).toMatchObject({
      repo_id: REPO.id,
      provider: 'openrouter',
      model: 'm',
      tokens_in: 10,
      tokens_out: 5,
      outcome: 'ok',
      prose_unverified_paths: 1,
      dropped: {
        critical_paths: { invalid: 1, overflow: 0 },
        run_locally: { undeclared: 1, overflow: 0 },
      },
    });
    expect(typeof (line as { duration_ms: unknown }).duration_ms).toBe('number');
    expect(JSON.stringify(ok.log.info.mock.calls)).not.toContain('SECRET-README-TEXT');

    const bad = setup();
    bad.llm.failWith = new Error('boom');
    await failure(bad.svc.generate(WS, REPO.id, bad.log));
    expect(bad.log.warn).toHaveBeenCalledTimes(1);
    expect(bad.log.warn.mock.calls[0]![0]).toMatchObject({ outcome: 'provider_error', cause: 'boom' });
    expect(JSON.stringify(bad.log.warn.mock.calls)).not.toContain('SECRET-README-TEXT');
  });

  it('a repository of another workspace is not found', async () => {
    // Catches: cross-workspace read/generate (tenancy).
    const { svc, llm, log } = setup();
    expect((await failure(svc.generate('other-ws', REPO.id, log))).statusCode).toBe(404);
    expect((await failure(svc.getState('other-ws', REPO.id))).statusCode).toBe(404);
    expect(llm.calls).toHaveLength(0);
  });
});
