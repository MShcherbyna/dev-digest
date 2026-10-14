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
 * Runs eval cases through the review engine. Cases are fed ONLY the case diff,
 * the PR title/body, the agent's system prompt/model/strategy: no skills,
 * memory, specs, callers, repo map or intent (P1-AC-16). Cases run one at a time.
 * Logs never contain diff, PR body, prompt or finding text.
 */
export class EvalExecutor {
  constructor(private deps: EvalDeps) {}

  private now(): number {
    return (this.deps.now?.() ?? new Date()).getTime();
  }

  /** Run one case; never throws, an engine failure becomes an `error` outcome. */
  private async runCase(
    cfg: CaseRunConfig,
    c: RunnableCase,
    llm: LLMProvider,
    sessionId: string,
  ): Promise<CaseOutcome> {
    const started = this.now();
    try {
      const diff = this.deps.parseDiff(c.inputDiff);
      const result = await this.deps.engine({
        systemPrompt: cfg.systemPrompt,
        model: cfg.model,
        diff,
        llm,
        strategy: cfg.strategy,
        task: this.deps.taskLine({ title: c.inputMeta.title }),
        ...(c.inputMeta.body ? { prDescription: c.inputMeta.body } : {}),
        sessionId,
      });
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
    let outcome: CaseOutcome;
    try {
      const llm = await this.deps.llm(cfg.provider);
      outcome = await this.runCase(cfg, c, llm, `eval:${resultId}:${c.id}`);
    } catch (err) {
      outcome = erroredOutcome(this.reasonForLlmFailure(err), this.now() - started);
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
        if (!(await this.deps.runs.runExists(runId))) {
          log.warn({ ...base, reason: EVAL_REASON.agentDeleted }, 'eval run: stopped');
          aborted = true;
          break;
        }
        let outcome: CaseOutcome;
        if (!llm) {
          outcome = erroredOutcome(reason ?? EVAL_REASON.missingApiKey, 0);
        } else if (!(await this.deps.cases.getCase(workspaceId, c.id))) {
          outcome = erroredOutcome(EVAL_REASON.caseDeleted, 0);
        } else {
          outcome = await this.runCase(snapshot, c, llm, `eval:${runId}:${c.id}`);
        }
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
      await this.finalize(runId, records, reason, true, started, base, log);
      return;
    }

    if (aborted) return;
    await this.finalize(runId, records, reason, false, started, base, log);
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
