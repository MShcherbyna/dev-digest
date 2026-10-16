import { AppError, NotFoundError } from '../../platform/errors.js';
import { DIFF_MAX_CHARS, EVAL_ERROR, EVAL_REASON, RECENT_RUNS_LIMIT, SPARKLINE_POINTS } from './constants.js';
import type { EvalAgent, EvalDeps, EvalLog } from './ports.js';
import type {
  AgentEvalCard,
  AgentEvalDashboardResponse,
  CompareResponse,
  CompareSide,
  EvalAgentRun,
  EvalCase,
  EvalDashboardResponse,
  RunAllResponse,
  RunAllSkipReason,
  EvalCaseBody,
  EvalCaseSummary,
  EvalRunDetailResponse,
  ExpectedItem,
  StartAgentRunResponse,
  StartCaseRunResponse,
} from './schemas.js';
import { EvalExecutor } from './executor.js';
import { buildFileDiff, firstExpectationOutsideDiff, rangeTouchesNewLines } from './domain/case-diff.js';
import { slugify } from './domain/slug.js';
import {
  compareDeltas,
  currentAndDelta,
  finishedRuns,
  orderPair,
  rangeStart,
  recallSparkline,
  regressionAlert,
  trend,
  type DashboardRange,
} from './domain/dashboard.js';

const SEVERITIES = new Set(['CRITICAL', 'WARNING', 'SUGGESTION']);
const CATEGORY_MAX = 64;
const TITLE_MAX = 300;

function unprocessable(code: string, message: string, details?: unknown): AppError {
  return new AppError(code, message, 422, details);
}

/**
 * Eval use cases. Depends only on ports (see `ports.ts`); background execution
 * is fire-and-forget (long runs do not fit `JobRunner`'s timeout/retries).
 */
export class EvalService {
  private executor: EvalExecutor;

  constructor(private deps: EvalDeps) {
    this.executor = new EvalExecutor(deps);
  }

  // ---- cases ----------------------------------------------------------------

  async createFromFinding(workspaceId: string, findingId: string): Promise<EvalCase> {
    const d = this.deps;
    const src = await d.findings.findingForCase(workspaceId, findingId);
    if (!src) throw new NotFoundError('Finding not found');

    const accepted =
      src.acceptedAt !== null && (src.dismissedAt === null || src.acceptedAt >= src.dismissedAt);
    if (!accepted && src.dismissedAt === null) {
      throw unprocessable(EVAL_ERROR.undecided, 'Accept or dismiss the finding first');
    }
    if (!src.agentId || !src.agentExists) {
      throw unprocessable(EVAL_ERROR.agentMissing, 'The agent that produced this finding no longer exists');
    }
    const existing = await d.cases.caseIdForFinding(workspaceId, src.agentId, findingId);
    if (existing) {
      throw new AppError(EVAL_ERROR.caseExists, 'An eval case already exists for this finding', 409, {
        case_id: existing,
      });
    }
    if (!src.patch) throw unprocessable(EVAL_ERROR.diffUnavailable, 'No diff is stored for this finding');

    const inputDiff = buildFileDiff(src.file, src.patch);
    const parsed = d.parseDiff(inputDiff);
    if (!parsed.files.some((f) => f.path === src.file)) {
      throw unprocessable(EVAL_ERROR.diffUnavailable, 'The stored diff could not be parsed');
    }
    // Full-file finding kinds ground against the file existing in the diff, not a hunk.
    if (
      !d.isFullFileKind(src.kind) &&
      !rangeTouchesNewLines(d.lineIndex(parsed), src.file, src.startLine, src.endLine)
    ) {
      throw unprocessable(EVAL_ERROR.rangeOutsideDiff, 'The finding range is outside the stored diff');
    }

    const item: ExpectedItem = {
      expect: accepted ? 'must_find' : 'must_not_flag',
      file: src.file,
      start_line: src.startLine,
      end_line: Math.max(src.endLine, src.startLine),
      ...(SEVERITIES.has(src.severity) ? { severity: src.severity as ExpectedItem['severity'] } : {}),
      ...(src.category ? { category: src.category.slice(0, CATEGORY_MAX) } : {}),
      ...(src.title ? { title: src.title.slice(0, TITLE_MAX) } : {}),
    };
    const res = await d.cases.insertCase(workspaceId, {
      agentId: src.agentId,
      name: slugify(src.title),
      origin: 'finding',
      inputDiff,
      inputMeta: { title: src.prTitle, body: src.prBody ?? '' },
      expectedOutput: [item],
      notes: null,
      sourceFindingId: src.findingId,
      sourcePrId: src.prId,
    });
    if (res.kind === 'exists') {
      throw new AppError(EVAL_ERROR.caseExists, 'An eval case already exists for this finding', 409, {
        case_id: res.caseId,
      });
    }
    return res.case;
  }

  /** Shared create/update validation: size, parsability, `must_find` ranges inside the diff. */
  private validateBody(body: EvalCaseBody): void {
    const d = this.deps;
    if (body.input_diff.length > DIFF_MAX_CHARS) {
      throw unprocessable(EVAL_ERROR.diffTooLarge, `Diff exceeds ${DIFF_MAX_CHARS} characters`);
    }
    const parsed = d.parseDiff(body.input_diff);
    if (!parsed.files.some((f) => f.path !== '')) {
      throw unprocessable(EVAL_ERROR.diffUnparsable, 'The diff contains no files');
    }
    const outside = firstExpectationOutsideDiff(body.expected_output, d.lineIndex(parsed));
    if (outside !== null) {
      throw unprocessable(
        EVAL_ERROR.expectationOutsideDiff,
        `Expected item ${outside + 1} is outside the diff`,
        { index: outside },
      );
    }
  }

  async createCase(workspaceId: string, agentId: string, body: EvalCaseBody): Promise<EvalCase> {
    const agent = await this.deps.agents.get(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    this.validateBody(body);
    const res = await this.deps.cases.insertCase(workspaceId, {
      agentId,
      name: body.name,
      origin: 'manual',
      inputDiff: body.input_diff,
      inputMeta: body.input_meta,
      expectedOutput: body.expected_output,
      notes: body.notes ?? null,
      sourceFindingId: null,
      sourcePrId: null,
    });
    if (res.kind === 'exists') throw new AppError(EVAL_ERROR.caseExists, 'Eval case already exists', 409);
    return res.case;
  }

  async updateCase(workspaceId: string, caseId: string, body: EvalCaseBody): Promise<EvalCase> {
    const current = await this.deps.cases.getCase(workspaceId, caseId);
    if (!current) throw new NotFoundError('Eval case not found');
    this.validateBody(body);
    const updated = await this.deps.cases.updateCase(workspaceId, caseId, {
      name: body.name,
      inputDiff: body.input_diff,
      inputMeta: body.input_meta,
      expectedOutput: body.expected_output,
      notes: body.notes ?? null,
    });
    if (!updated) throw new NotFoundError('Eval case not found');
    return updated;
  }

  async getCase(workspaceId: string, caseId: string): Promise<EvalCase> {
    const c = await this.deps.cases.getCase(workspaceId, caseId);
    if (!c) throw new NotFoundError('Eval case not found');
    return c;
  }

  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseSummary[]> {
    await this.requireAgent(workspaceId, agentId);
    return this.deps.cases.listCases(workspaceId, agentId);
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<void> {
    if (!(await this.deps.cases.deleteCase(workspaceId, caseId))) {
      throw new NotFoundError('Eval case not found');
    }
  }

  // ---- runs -------------------------------------------------------------------

  private async requireAgent(workspaceId: string, agentId: string): Promise<EvalAgent> {
    const agent = await this.deps.agents.get(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  async startCaseRun(workspaceId: string, caseId: string, log: EvalLog): Promise<StartCaseRunResponse> {
    const c = await this.getCase(workspaceId, caseId);
    const agent = await this.requireAgent(workspaceId, c.agent_id);
    const started = await this.deps.runs.startCaseResult(workspaceId, caseId);
    if (started.kind === 'running') {
      throw new AppError(EVAL_ERROR.caseRunning, 'This case is already running', 409, {
        result_id: started.resultId,
      });
    }
    const runnable = {
      id: c.id,
      name: c.name,
      inputDiff: c.input_diff,
      inputMeta: c.input_meta,
      expectedOutput: c.expected_output,
    };
    void this.executor.runSingle(started.resultId, agent, runnable, log).catch((err) => {
      log.warn({ resultId: started.resultId, err: (err as Error).message }, 'eval: single-case run crashed');
    });
    return { result_id: started.resultId };
  }

  async startAgentRun(workspaceId: string, agentId: string, log: EvalLog): Promise<StartAgentRunResponse> {
    const d = this.deps;
    const agent = await this.requireAgent(workspaceId, agentId);
    const active = await d.runs.activeRunId(workspaceId, agentId);
    if (active) throw this.runActive(active);
    const casesTotal = await d.cases.countCases(workspaceId, agentId);
    if (casesTotal === 0) throw unprocessable(EVAL_ERROR.noCases, 'The agent has no eval cases');

    const snapshot = {
      agentVersion: agent.version,
      provider: agent.provider,
      model: agent.model,
      strategy: agent.strategy,
      systemPrompt: agent.systemPrompt,
      skillIds: await d.agents.enabledSkillIds(agentId),
    };
    const inserted = await d.runs.insertAgentRun(workspaceId, agentId, snapshot, casesTotal);
    if (inserted.kind === 'active_exists') throw this.runActive(inserted.runId);

    const runId = inserted.runId;
    void this.executor.runAgentRun(workspaceId, agentId, runId, snapshot, log).catch((err) => {
      log.warn({ runId, err: (err as Error).message }, 'eval: agent run crashed');
    });
    return { eval_run_id: runId, status: 'running', cases_total: casesTotal };
  }

  private runActive(runId: string | null): AppError {
    return new AppError(EVAL_ERROR.runActive, 'An eval run is already active for this agent', 409, {
      eval_run_id: runId,
    });
  }

  /**
   * Stops one case: a running single run, or its slot in the agent's active run (the run carries on).
   * Idempotent: a case that is not running is a no-op.
   */
  async cancelCase(workspaceId: string, caseId: string): Promise<void> {
    const c = await this.deps.cases.getCase(workspaceId, caseId);
    if (!c) throw new NotFoundError('Eval case not found');
    const runId = await this.deps.runs.activeRunId(workspaceId, c.agent_id);
    await this.executor.cancelCase(caseId, runId);
  }

  /** Stops an agent run; it ends `failed` with reason `cancelled`. Idempotent for a finished run. */
  async cancelRun(workspaceId: string, runId: string): Promise<void> {
    const run = await this.deps.runs.getAgentRun(workspaceId, runId);
    if (!run) throw new NotFoundError('Eval run not found');
    if (run.status !== 'running') return;
    if (this.executor.cancelRun(runId)) return;
    // Not executing in this process: fail the row so it stops blocking new runs.
    await this.deps.runs.finalizeRun(runId, {
      status: 'failed',
      casesExecuted: 0,
      casesErrored: 0,
      casesPassed: 0,
      recall: null,
      precision: null,
      citationAccuracy: null,
      costUsd: null,
      reason: EVAL_REASON.cancelled,
      durationMs: 0,
    });
  }

  async getRun(workspaceId: string, runId: string): Promise<EvalRunDetailResponse> {
    const run = await this.deps.runs.getAgentRun(workspaceId, runId);
    if (!run) throw new NotFoundError('Eval run not found');
    const cases = await this.deps.runs.listRunResults(workspaceId, runId);
    return {
      run,
      progress: { done: run.cases_executed + run.cases_errored, total: run.cases_total },
      cases,
    };
  }

  async listRuns(workspaceId: string, agentId: string, since?: string): Promise<EvalAgentRun[]> {
    await this.requireAgent(workspaceId, agentId);
    return this.deps.runs.listAgentRuns(workspaceId, agentId, since ? new Date(since) : undefined);
  }

  // ---- dashboards, compare, run-all ------------------------------------------

  /** All-agents cards (agents with >= 1 case) + the latest finished runs. */
  async dashboard(workspaceId: string): Promise<EvalDashboardResponse> {
    const d = this.deps;
    const [rows, recent] = await Promise.all([
      d.dashboard.dashboardAgents(workspaceId),
      d.dashboard.recentFinishedRuns(workspaceId, RECENT_RUNS_LIMIT),
    ]);
    const agents = rows.map((a): AgentEvalCard => {
      const { current } = currentAndDelta(a.finishedRuns);
      return {
        id: a.id,
        name: a.name,
        provider: a.provider,
        model: a.model,
        enabled: a.enabled,
        cases_total: a.casesTotal,
        has_running_run: a.hasRunningRun,
        last_run: current
          ? {
              id: current.id,
              agent_version: current.agent_version,
              started_at: current.started_at,
              cases_passed: current.cases_passed,
              cases_executed: current.cases_executed,
            }
          : null,
        recall_trend: recallSparkline(a.finishedRuns, SPARKLINE_POINTS),
        latest: {
          recall: current?.recall ?? null,
          precision: current?.precision ?? null,
          citation_accuracy: current?.citation_accuracy ?? null,
        },
      };
    });
    return { agents, recent_runs: recent };
  }

  async agentDashboard(
    workspaceId: string,
    agentId: string,
    range: DashboardRange,
  ): Promise<AgentEvalDashboardResponse> {
    const d = this.deps;
    const agent = await this.requireAgent(workspaceId, agentId);
    const since = rangeStart(range, (d.now ?? (() => new Date()))());
    const [runs, casesTotal] = await Promise.all([
      d.runs.listAgentRuns(workspaceId, agentId, since),
      d.cases.countCases(workspaceId, agentId),
    ]);
    const { current, delta } = currentAndDelta(runs);
    const [latest, previous] = finishedRuns(runs);
    return {
      agent: {
        id: agent.id,
        name: agent.name,
        provider: agent.provider,
        model: agent.model,
        version: agent.version,
        enabled: agent.enabled,
      },
      cases_total: casesTotal,
      runs_in_range: runs.length,
      current: current
        ? {
            run_id: current.id,
            agent_version: current.agent_version,
            recall: current.recall,
            precision: current.precision,
            citation_accuracy: current.citation_accuracy,
            cases_passed: current.cases_passed,
            cases_executed: current.cases_executed,
            cost_usd: current.cost_usd,
          }
        : null,
      delta,
      trend: trend(runs).map((r) => ({
        run_id: r.id,
        started_at: r.started_at,
        recall: r.recall,
        precision: r.precision,
        citation_accuracy: r.citation_accuracy,
      })),
      runs,
      alert: regressionAlert(latest, previous),
    };
  }

  /** Two finished runs of one agent, ordered by start time (A earlier). */
  async compare(workspaceId: string, idA: string, idB: string): Promise<CompareResponse> {
    const d = this.deps;
    const [runA, runB] = await Promise.all([
      d.runs.getAgentRun(workspaceId, idA),
      d.runs.getAgentRun(workspaceId, idB),
    ]);
    if (!runA || !runB) throw new NotFoundError('Eval run not found');
    if (runA.agent_id !== runB.agent_id) {
      throw unprocessable(EVAL_ERROR.compareCrossAgent, 'Runs belong to different agents');
    }
    const finished = (s: string) => s === 'done' || s === 'partial';
    if (!finished(runA.status) || !finished(runB.status)) {
      throw unprocessable(EVAL_ERROR.compareNotFinished, 'Both runs must be finished');
    }
    const [first, second] = orderPair(runA, runB);
    const [casesTotal, sideA, sideB] = await Promise.all([
      d.cases.countCases(workspaceId, first.agent_id),
      this.compareSide(workspaceId, first),
      this.compareSide(workspaceId, second),
    ]);
    return {
      a: sideA,
      b: sideB,
      deltas: compareDeltas(first, second),
      prompt_a: first.system_prompt,
      prompt_b: second.system_prompt,
      cases_total: casesTotal,
    };
  }

  private async compareSide(
    workspaceId: string,
    run: {
      id: string;
      agent_id: string;
      agent_version: number;
      started_at: string;
      recall: number | null;
      precision: number | null;
      citation_accuracy: number | null;
      cost_usd: number | null;
    },
  ): Promise<CompareSide> {
    const cfg = await this.deps.configs.isCurrentConfig(workspaceId, run.agent_id, run.agent_version);
    return {
      id: run.id,
      agent_version: run.agent_version,
      started_at: run.started_at,
      recall: run.recall,
      precision: run.precision,
      citation_accuracy: run.citation_accuracy,
      cost_usd: run.cost_usd,
      is_current_config: cfg.current,
      version_available: cfg.available,
    };
  }

  /** Starts a run for every eligible agent; never throws for a single agent's failure. */
  async runAll(workspaceId: string, log: EvalLog): Promise<RunAllResponse> {
    const d = this.deps;
    const started: RunAllResponse['started'] = [];
    const skipped: RunAllResponse['skipped'] = [];
    const skip = (agentId: string, reason: RunAllSkipReason) => skipped.push({ agent_id: agentId, reason });

    for (const agent of await d.agents.list(workspaceId)) {
      if (!agent.enabled) {
        skip(agent.id, 'disabled');
        continue;
      }
      try {
        if ((await d.cases.countCases(workspaceId, agent.id)) === 0) {
          skip(agent.id, 'no_cases');
        } else if (await d.runs.activeRunId(workspaceId, agent.id)) {
          skip(agent.id, 'already_running');
        } else {
          const run = await this.startAgentRun(workspaceId, agent.id, log);
          started.push({ agent_id: agent.id, eval_run_id: run.eval_run_id });
        }
      } catch (err) {
        // A concurrent start can still win between the checks above and the insert.
        const code = err instanceof AppError ? err.code : null;
        skip(
          agent.id,
          code === EVAL_ERROR.runActive ? 'already_running' : code === EVAL_ERROR.noCases ? 'no_cases' : 'error',
        );
      }
    }
    log.info({ started: started.length, skipped: skipped.length }, 'eval: run-all');
    return { started, skipped };
  }

  /** Boot cleanup: fail runs/results left `running` by a dead process. */
  async reapStale(): Promise<{ runs: number; results: number }> {
    return this.deps.runs.reapStale();
  }
}
