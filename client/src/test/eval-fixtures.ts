import type {
  AgentEvalCard,
  AgentEvalDashboardResponse,
  CompareResponse,
  CompareSide,
  EvalAgentRun,
  RecentEvalRun,
  TrendPoint,
} from "@/lib/hooks/eval";

/** Eval dashboard fixtures (Part 2). Fractions, not percents; null = no data. */
export function agentCard(over: Partial<AgentEvalCard> = {}): AgentEvalCard {
  return {
    id: "ag1",
    name: "Security reviewer",
    provider: "anthropic",
    model: "claude-sonnet",
    enabled: true,
    cases_total: 5,
    has_running_run: false,
    last_run: { id: "r1", agent_version: 3, started_at: "2026-10-10T10:00:00.000Z", cases_passed: 4, cases_executed: 5 },
    recall_trend: [0.7, 0.8],
    latest: { recall: 0.82, precision: 0.9, citation_accuracy: 0.75 },
    ...over,
  };
}

export function recentRun(over: Partial<RecentEvalRun> = {}): RecentEvalRun {
  return {
    id: "rr1",
    agent_id: "ag1",
    agent_name: "Security reviewer",
    agent_version: 3,
    started_at: "2026-10-10T10:00:00.000Z",
    cases_passed: 4,
    cases_executed: 5,
    recall: 0.82,
    precision: 0.9,
    citation_accuracy: 0.75,
    ...over,
  };
}

export function agentRun(over: Partial<EvalAgentRun> = {}): EvalAgentRun {
  return {
    id: "run1",
    agent_id: "ag1",
    agent_version: 3,
    provider: "anthropic",
    model: "claude-sonnet",
    strategy: "single",
    skill_ids: [],
    status: "done",
    reason: null,
    started_at: "2026-10-10T10:00:00.000Z",
    finished_at: "2026-10-10T10:05:00.000Z",
    cases_total: 5,
    cases_executed: 5,
    cases_errored: 0,
    cases_passed: 4,
    recall: 0.82,
    precision: 0.9,
    citation_accuracy: 0.75,
    cost_usd: 0.1234,
    duration_ms: 5000,
    ...over,
  };
}

export function trendPoint(over: Partial<TrendPoint> = {}): TrendPoint {
  return { run_id: "run1", started_at: "2026-10-10T10:00:00.000Z", recall: 0.8, precision: 0.9, citation_accuracy: 0.7, ...over };
}

export function agentDashboard(over: Partial<AgentEvalDashboardResponse> = {}): AgentEvalDashboardResponse {
  return {
    agent: { id: "ag1", name: "Security reviewer", provider: "anthropic", model: "claude-sonnet", version: 3, enabled: true },
    cases_total: 5,
    runs_in_range: 2,
    current: {
      run_id: "run2",
      agent_version: 3,
      cases_passed: 4,
      cases_executed: 5,
      cost_usd: 0.12,
      recall: 0.82,
      precision: 0.9,
      citation_accuracy: 0.75,
    },
    delta: { recall: 0.04, precision: -0.02, citation_accuracy: 0 },
    trend: [
      trendPoint({ run_id: "run1", started_at: "2026-10-09T10:00:00.000Z", recall: 0.78 }),
      trendPoint({ run_id: "run2", started_at: "2026-10-10T10:00:00.000Z", recall: 0.82 }),
    ],
    runs: [
      agentRun({ id: "run2", agent_version: 3, started_at: "2026-10-10T10:00:00.000Z" }),
      agentRun({ id: "run1", agent_version: 2, started_at: "2026-10-09T10:00:00.000Z" }),
    ],
    alert: null,
    ...over,
  };
}

function side(over: Partial<CompareSide> = {}): CompareSide {
  return {
    id: "run1",
    agent_version: 2,
    started_at: "2026-10-09T10:00:00.000Z",
    recall: 0.78,
    precision: 0.9,
    citation_accuracy: 0.7,
    cost_usd: 0.1,
    is_current_config: false,
    version_available: true,
    ...over,
  };
}

export function compareResponse(over: Partial<CompareResponse> = {}): CompareResponse {
  return {
    a: side(),
    b: side({ id: "run2", agent_version: 3, started_at: "2026-10-10T10:00:00.000Z", recall: 0.82, citation_accuracy: 0.7, cost_usd: 0.12 }),
    deltas: { recall: 0.04, precision: 0, citation_accuracy: 0, cost_usd: 0.02 },
    prompt_a: "line one\nold line\nline three",
    prompt_b: "line one\nnew line\nline three",
    cases_total: 5,
    ...over,
  };
}
