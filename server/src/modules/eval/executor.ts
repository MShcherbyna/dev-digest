import type { LLMProvider } from '@devdigest/shared';
import { ERROR_REASON_MAX, EVAL_REASON } from './constants.js';
import type {
  AgentSnapshot,
  CaseOutcome,
  EvalDeps,
  EvalLog,
  RunnableCase,
} from './ports.js';
import { aggregateRun, expectedCount, scoreCase, type CaseRecord } from './domain/scoring.js';

/** Settings an eval case runs with (the agent's config, or a run's snapshot). */
type CaseRunConfig = Pick<AgentSnapshot, 'provider' | 'model' | 'strategy' | 'systemPrompt'>;

const ERRORED_ZEROS = {
  errored: true,
  mustFindTotal: 0,
  mustFindMatched: 0,
  positiveFindings: 0,
  negativeFindings: 0,
  keptCount: 0,
  droppedCount: 0,
  pass: false,
  costUsd: null,
  expectedCount: 0,
  gotCount: 0,
  actualOutput: null,
} as const;

/** Short, content-free reason: the error message, truncated. */
function shortReason(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, ERROR_REASON_MAX);
}

function erroredOutcome(reason: string, durationMs: number): CaseOutcome {
  return { ...ERRORED_ZEROS, errorReason: reason, durationMs };
}

/**
 * Rejects once `trigger()` runs. Raced against the engine call so a cancel returns at once; the
 * HTTP request itself runs on until its own timeout and its late result is discarded.
 */
interface Cancel {
  promise: Promise<never>;
  trigger: () => void;
}

function makeCancel(): Cancel {
  let trigger!: () => void;
  const promise = new Promise<never>((_, reject) => {
    trigger = () => reject(new Error(EVAL_REASON.cancelled));
  });
  promise.catch(() => undefined);
  return { promise, trigger };
}

/** In-memory state of an agent run while this process executes it. */
interface ActiveRun {
  /** Whole run cancelled: the loop stops and the run is finalised as `failed`/`cancelled`. */
  cancelled: boolean;
  current: { caseId: string; cancel: Cancel } | null;
  /** Cases that already have a stored result in this run (finished, or cancelled while queued). */
  settled: Set<string>;
  /** Cases cancelled while still queued; their result is already stored, the loop just steps over them. */
  skipped: Set<string>;
  /** Outcomes of those queued cancels, so the final aggregate counts them as errored. */
  queuedCancels: CaseOutcome[];
}

/**
 * Runs eval cases through the review engine. Cases are fed ONLY the case diff,
 * the PR title/body, the agent's system prompt/model/strategy: no skills,
 * memory, specs, callers, repo map or intent (P1-AC-16). Cases run one at a time.
 * Logs never contain diff, PR body, prompt or finding text.
 */
export class EvalExecutor {
  private activeRuns = new Map<string, ActiveRun>();
  /** Single-case runs in flight, by case id. */
  private activeSingles = new Map<string, Cancel>();

  constructor(private deps: EvalDeps) {}

  /** Stops the whole agent run. False when this process is not executing it. */
  cancelRun(runId: string): boolean {
    const run = this.activeRuns.get(runId);
    if (!run) return false;
    run.cancelled = true;
    run.current?.cancel.trigger();
    return true;
  }

  /**
   * Stops one case: its single run, or its slot in the agent's active run (the run carries on with
   * the next case). False when nothing of this case is active here.
   */
  async cancelCase(caseId: string, runId: string | null): Promise<boolean> {
    const single = this.activeSingles.get(caseId);
    if (single) {
      single.trigger();
      return true;
    }
    const run = runId ? this.activeRuns.get(runId) : undefined;
    if (!runId || !run || run.settled.has(caseId)) return false;
    if (run.current?.caseId === caseId) {
      run.current.cancel.trigger();
      return true;
    }
    // Still queued: store the cancelled result now so the row stops spinning at once.
    run.skipped.add(caseId);
    run.settled.add(caseId);
    const outcome = erroredOutcome(EVAL_REASON.cancelled, 0);
    run.queuedCancels.push(outcome);
    await this.deps.runs.recordCaseResult(runId, caseId, outcome);
    return true;
  }

  private now(): number {
    return (this.deps.now?.() ?? new Date()).getTime();
  }

  /** Run one case; never throws, an engine failure becomes an `error` outcome. */
  private async runCase(
    cfg: CaseRunConfig,
    c: RunnableCase,
    llm: LLMProvider,
    sessionId: string,
    cancel?: Cancel,
  ): Promise<CaseOutcome> {
    const started = this.now();
    try {
      const diff = this.deps.parseDiff(c.inputDiff);
      const call = this.deps.engine({
        systemPrompt: cfg.systemPrompt,
        model: cfg.model,
        diff,
        llm,
        strategy: cfg.strategy,
        task: this.deps.taskLine({ title: c.inputMeta.title }),
        ...(c.inputMeta.body ? { prDescription: c.inputMeta.body } : {}),
        sessionId,
      });
      const result = await (cancel ? Promise.race([call, cancel.promise]) : call);
      const score = scoreCase(c.expectedOutput, result.kept);
      const record: CaseRecord = {
        errored: false,
        mustFindTotal: score.mustFindTotal,
        mustFindMatched: score.mustFindMatched,
        positiveFindings: score.positiveFindings,
        negativeFindings: score.negativeFindings,
        keptCount: result.kept.length,
        droppedCount: result.dropped,
        pass: score.pass,
        costUsd: result.costUsd,
      };
      return {
        ...record,
        expectedCount: expectedCount(c.expectedOutput),
        gotCount: score.gotCount,
        actualOutput: result.kept,
        errorReason: null,
        durationMs: this.now() - started,
      };
    } catch (err) {
      return erroredOutcome(shortReason(err), this.now() - started);
    }
  }

  /** Single-case run: always the agent's current config; updates the pre-inserted result row. */
  async runSingle(
    resultId: string,
    cfg: CaseRunConfig,
    c: RunnableCase,
    log: EvalLog,
  ): Promise<void> {
    const started = this.now();
    const cancel = makeCancel();
    this.activeSingles.set(c.id, cancel);
    let outcome: CaseOutcome;
    try {
      const llm = await this.deps.llm(cfg.provider);
      outcome = await this.runCase(cfg, c, llm, `eval:${resultId}:${c.id}`, cancel);
    } catch (err) {
      outcome = erroredOutcome(this.reasonForLlmFailure(err), this.now() - started);
    } finally {
      if (this.activeSingles.get(c.id) === cancel) this.activeSingles.delete(c.id);
    }
    const stored = await this.deps.runs.finishCaseResult(resultId, outcome);
    if (!stored) log.info({ resultId }, 'eval: single-case result gone before it finished');
  }

  private reasonForLlmFailure(err: unknown): string {
    return this.deps.isConfigError(err) ? EVAL_REASON.missingApiKey : shortReason(err);
  }

  /** Agent-level run over all of the agent's cases, sequentially. Finalises the run row. */
  async runAgentRun(
    workspaceId: string,
    agentId: string,
    runId: string,
    snapshot: AgentSnapshot,
    log: EvalLog,
  ): Promise<void> {
    const state: ActiveRun = { cancelled: false, current: null, settled: new Set(), skipped: new Set(), queuedCancels: [] };
    this.activeRuns.set(runId, state);
    try {
      await this.executeRun(workspaceId, agentId, runId, snapshot, log, state);
    } finally {
      this.activeRuns.delete(runId);
    }
  }

  private async executeRun(
    workspaceId: string,
    agentId: string,
    runId: string,
    snapshot: AgentSnapshot,
    log: EvalLog,
    state: ActiveRun,
  ): Promise<void> {
    const started = this.now();
    const base = { runId, agentId, version: snapshot.agentVersion };
    const records: CaseRecord[] = [];
    let reason: string | null = null;
    let aborted = false;

    try {
      const cases = await this.deps.cases.runnableCases(workspaceId, agentId);
      log.info({ ...base, casesTotal: cases.length }, 'eval run: started');

      let llm: LLMProvider | null = null;
      try {
        llm = await this.deps.llm(snapshot.provider);
      } catch (err) {
        reason = this.reasonForLlmFailure(err);
      }

      for (const c of cases) {
        if (state.cancelled) break;
        if (!(await this.deps.runs.runExists(runId))) {
          log.warn({ ...base, reason: EVAL_REASON.agentDeleted }, 'eval run: stopped');
          aborted = true;
          break;
        }
        let outcome: CaseOutcome | null = null;
        if (!llm) {
          outcome = erroredOutcome(reason ?? EVAL_REASON.missingApiKey, 0);
        } else if (!(await this.deps.cases.getCase(workspaceId, c.id))) {
          outcome = erroredOutcome(EVAL_REASON.caseDeleted, 0);
        }
        // Checked after the awaits and before `current` is set, so a cancel cannot slip in between.
        if (state.skipped.has(c.id)) continue;
        if (state.cancelled) break;
        if (!outcome && llm) {
          const cancel = makeCancel();
          state.current = { caseId: c.id, cancel };
          try {
            outcome = await this.runCase(snapshot, c, llm, `eval:${runId}:${c.id}`, cancel);
          } finally {
            state.current = null;
          }
        }
        if (!outcome) continue;
        state.settled.add(c.id);
        records.push(outcome);
        if (!(await this.deps.runs.recordCaseResult(runId, c.id, outcome))) {
          log.warn({ ...base, reason: EVAL_REASON.agentDeleted }, 'eval run: stopped');
          aborted = true;
          break;
        }
      }
    } catch (err) {
      // Unexpected failure: still finalise so the run does not stay `running` and block new runs.
      reason = shortReason(err);
      log.warn({ ...base, reason }, 'eval run: crashed');
      await this.finalize(runId, [...records, ...state.queuedCancels], reason, true, started, base, log);
      return;
    }

    if (aborted) return;
    if (state.cancelled) {
      log.info({ ...base }, 'eval run: cancelled');
      await this.finalize(runId, [...records, ...state.queuedCancels], EVAL_REASON.cancelled, true, started, base, log);
      return;
    }
    await this.finalize(runId, [...records, ...state.queuedCancels], reason, false, started, base, log);
  }

  private async finalize(
    runId: string,
    records: CaseRecord[],
    reason: string | null,
    crashed: boolean,
    started: number,
    base: Record<string, unknown>,
    log: EvalLog,
  ): Promise<void> {
    const agg = aggregateRun(records);
    const durationMs = this.now() - started;
    // A crash leaves cases unrun, so the run cannot be `done`/`partial`.
    const status = crashed ? 'failed' : agg.status;
    const stored = await this.deps.runs.finalizeRun(runId, {
      ...agg,
      status,
      reason,
      durationMs,
    });
    if (!stored) return;
    log.info(
      {
        ...base,
        casesTotal: records.length,
        executed: agg.casesExecuted,
        errored: agg.casesErrored,
        status,
        durationMs,
        costUsd: agg.costUsd,
      },
      'eval run: finished',
    );
  }
}
