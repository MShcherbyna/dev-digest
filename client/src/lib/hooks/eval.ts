/* hooks/eval.ts — eval pipeline types (mirror of server/src/modules/eval/schemas.ts).
   The shapes are module-local on the server because the vendored EvalRun/EvalCase
   contracts have no nullable metrics (vendor/shared is do-not-touch), so they are
   mirrored here by hand like hooks/blast.ts. */
"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Agent, FindingRecord } from "@devdigest/shared";
import { api } from "../api";
import { queryKeys } from "./keys";

export type ExpectKind = "must_find" | "must_not_flag";
export type EvalSeverity = "CRITICAL" | "WARNING" | "SUGGESTION";

export interface ExpectedItem {
  expect: ExpectKind;
  file: string;
  start_line: number;
  end_line?: number;
  severity?: EvalSeverity;
  category?: string;
  title?: string;
}
export type ExpectedOutput = ExpectedItem[];

export interface CaseMeta {
  title: string;
  body: string;
}

/** Body of POST /agents/:id/eval-cases and PUT /eval-cases/:id. */
export interface EvalCaseBody {
  name: string;
  input_diff: string;
  input_meta: CaseMeta;
  expected_output: ExpectedOutput;
  notes?: string | null;
}

export type EvalCaseStatus = "running" | "passed" | "failed" | "error";
export type EvalCaseOrigin = "finding" | "manual";

export interface EvalCaseResult {
  id: string;
  case_id: string;
  eval_run_id: string | null;
  status: EvalCaseStatus;
  ran_at: string;
  finished_at: string | null;
  expected_count: number | null;
  got_count: number | null;
  kept_count: number | null;
  dropped_count: number | null;
  duration_ms: number | null;
  cost_usd: number | null;
  error_reason: string | null;
}

/** List item: GET /agents/:id/eval-cases (no input_diff). */
export interface EvalCaseSummary {
  id: string;
  agent_id: string;
  name: string;
  origin: EvalCaseOrigin;
  input_meta: CaseMeta;
  expected_output: ExpectedOutput;
  notes: string | null;
  source_finding_id: string | null;
  source_pr_id: string | null;
  created_at: string;
  updated_at: string;
  latest_result: EvalCaseResult | null;
}

/** GET /eval-cases/:id. */
export interface EvalCase extends EvalCaseSummary {
  input_diff: string;
}

export type EvalAgentRunStatus = "running" | "done" | "partial" | "failed";

export interface EvalAgentRun {
  id: string;
  agent_id: string;
  agent_version: number;
  provider: string;
  model: string;
  strategy: string;
  skill_ids: string[];
  status: EvalAgentRunStatus;
  reason: string | null;
  started_at: string;
  finished_at: string | null;
  cases_total: number;
  cases_executed: number;
  cases_errored: number;
  cases_passed: number;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
}

export interface EvalAgentRunDetail extends EvalAgentRun {
  system_prompt: string;
}

/** GET /eval-runs/:id. */
export interface EvalRunDetailResponse {
  run: EvalAgentRunDetail;
  progress: { done: number; total: number };
  cases: (EvalCaseResult & { case_name: string | null })[];
}

/** POST /eval-cases/:id/run -> 202. */
export interface StartCaseRunResponse {
  result_id: string;
}

/** POST /agents/:id/eval-runs -> 202. */
export interface StartAgentRunResponse {
  eval_run_id: string;
  status: "running";
  cases_total: number;
}

/** A finding as returned by GET /pulls/:id/reviews once the server adds `eval_case_id`. */
export type EvalAwareFinding = FindingRecord & { eval_case_id?: string | null };

/* ---- Part 2: dashboard, compare, promote, run-all (types only) ---- */

export type EvalMetric = "recall" | "precision" | "citation_accuracy";
export type EvalRange = "7d" | "30d" | "90d" | "all";

export interface MetricTriple {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
}

/** GET /eval/dashboard */
export interface AgentEvalCard {
  id: string;
  name: string;
  provider: string;
  model: string;
  enabled: boolean;
  cases_total: number;
  has_running_run: boolean;
  last_run: {
    id: string;
    agent_version: number;
    started_at: string;
    cases_passed: number;
    cases_executed: number;
  } | null;
  recall_trend: number[];
  latest: MetricTriple;
}

export interface RecentEvalRun extends MetricTriple {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_version: number;
  started_at: string;
  cases_passed: number;
  cases_executed: number;
}

export interface EvalDashboardResponse {
  agents: AgentEvalCard[];
  recent_runs: RecentEvalRun[];
}

/** GET /agents/:id/eval-dashboard?range= */
export interface AgentDashboardCurrent extends MetricTriple {
  run_id: string;
  agent_version: number;
  cases_passed: number;
  cases_executed: number;
  cost_usd: number | null;
}

export interface TrendPoint extends MetricTriple {
  run_id: string;
  started_at: string;
}

export interface RegressionAlert {
  version: number;
  dropped: { metric: EvalMetric; points: number }[];
  rose: EvalMetric[];
  held: EvalMetric[];
}

export interface AgentEvalDashboardResponse {
  agent: {
    id: string;
    name: string;
    provider: string;
    model: string;
    version: number;
    enabled: boolean;
  };
  cases_total: number;
  runs_in_range: number;
  current: AgentDashboardCurrent | null;
  /** Fractions (current - previous); null when < 2 finished runs. */
  delta: MetricTriple | null;
  trend: TrendPoint[];
  runs: EvalAgentRun[];
  alert: RegressionAlert | null;
}

/** GET /eval-runs/compare?a=&b= (server always returns a = older started_at). */
export interface CompareSide extends MetricTriple {
  id: string;
  agent_version: number;
  started_at: string;
  cost_usd: number | null;
  is_current_config: boolean;
  version_available: boolean;
}

export interface CompareResponse {
  a: CompareSide;
  b: CompareSide;
  deltas: MetricTriple & { cost_usd: number | null };
  prompt_a: string;
  prompt_b: string;
  cases_total: number;
}

/** POST /agents/:id/promote body. */
export interface PromoteBody {
  version: number;
}
export interface PromoteResponse {
  agent: Agent;
  version: number;
}

/** POST /eval-runs/all */
export type RunAllSkipReason = "no_cases" | "already_running" | "disabled" | "error";
export interface RunAllResponse {
  started: { agent_id: string; eval_run_id: string }[];
  skipped: { agent_id: string; reason: RunAllSkipReason }[];
}

/* ---- Hooks ---- */

/** Poll interval while something is running (P1-AC-18: refresh within 5 s). */
export const EVAL_POLL_MS = 2000;
/** Case-list poll while an agent run is active. Slower than EVAL_POLL_MS: the API rate-limits at 120 req/min and the run list + run detail already poll every 2 s. */
export const EVAL_CASES_POLL_MS = 4000;

/** `polling` forces the poll while an agent-level run is active: its cases are not "running" until reached. */
export function useEvalCases(agentId: string | null | undefined, polling = false) {
  return useQuery({
    queryKey: queryKeys.evalCases(agentId),
    queryFn: () => api.get<EvalCaseSummary[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
    refetchInterval: (q) =>
      q.state.data?.some((c) => c.latest_result?.status === "running")
        ? EVAL_POLL_MS
        : polling
          ? EVAL_CASES_POLL_MS
          : false,
  });
}

export function useEvalCase(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.evalCase(id),
    queryFn: () => api.get<EvalCase>(`/eval-cases/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.latest_result?.status === "running" ? EVAL_POLL_MS : false),
  });
}

export function useCreateEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EvalCaseBody) => api.post<EvalCase>(`/agents/${agentId}/eval-cases`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.evalCases(agentId) }),
  });
}

export function useUpdateEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: EvalCaseBody }) =>
      api.put<EvalCase>(`/eval-cases/${id}`, body),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: queryKeys.evalCases(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.evalCase(c.id) });
    },
  });
}

export function useDeleteEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/eval-cases/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.evalCases(agentId) }),
  });
}

/** Run one case against the agent's current config; the list/detail then poll until it finishes. */
export function useRunEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.post<StartCaseRunResponse>(`/eval-cases/${caseId}/run`),
    onSettled: (_d, _e, caseId) => {
      qc.invalidateQueries({ queryKey: queryKeys.evalCases(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.evalCase(caseId) });
    },
  });
}

/** Stop button on a case row: a running single run, or its slot in the agent's active run. */
export function useCancelEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.post<{ ok: boolean }>(`/eval-cases/${caseId}/cancel`),
    onSettled: (_d, _e, caseId) => {
      qc.invalidateQueries({ queryKey: queryKeys.evalCases(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.evalCase(caseId) });
      qc.invalidateQueries({ queryKey: queryKeys.agentEvalRuns(agentId) });
    },
  });
}

/** Stop button next to "Running… k/N": ends the agent run as failed/cancelled. */
export function useCancelEvalRun(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.post<{ ok: boolean }>(`/eval-runs/${runId}/cancel`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.agentEvalRuns(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.evalCases(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.agentEvalDashboard(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.evalDashboard() });
    },
  });
}

export function useAgentEvalRuns(agentId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.agentEvalRuns(agentId),
    queryFn: () => api.get<EvalAgentRun[]>(`/agents/${agentId}/eval-runs`),
    enabled: !!agentId,
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "running") ? EVAL_POLL_MS : false),
  });
  // The run list is what flips a run to terminal; once it does, the per-case results are final, so
  // refresh the case list here (the run-detail query is disabled as soon as no run is "running").
  const running = query.data?.some((r) => r.status === "running");
  const wasRunning = React.useRef(false);
  React.useEffect(() => {
    if (wasRunning.current && running === false) {
      qc.invalidateQueries({ queryKey: queryKeys.evalCases(agentId) });
    }
    if (running !== undefined) wasRunning.current = running;
  }, [running, agentId, qc]);
  return query;
}

/** Progress of one agent-level run; refreshes the case list and run list once it stops running. */
export function useEvalRun(id: string | null | undefined, agentId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.evalRun(id),
    queryFn: () => api.get<EvalRunDetailResponse>(`/eval-runs/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.run.status === "running" ? EVAL_POLL_MS : false),
  });
  const status = query.data?.run.status;
  React.useEffect(() => {
    if (status && status !== "running") {
      qc.invalidateQueries({ queryKey: queryKeys.evalCases(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.agentEvalRuns(agentId) });
    }
  }, [status, agentId, qc]);
  return query;
}

export function useStartEvalRun(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<StartAgentRunResponse>(`/agents/${agentId}/eval-runs`),
    // 409 (a run is already active) also means the run list is stale. The dashboards show the same runs.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.agentEvalRuns(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.agentEvalDashboard(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.evalDashboard() });
    },
  });
}

/** "Turn into eval case" on a finding. 201 and 409 both refetch the PR's reviews so `eval_case_id` shows up. */
export function useCreateCaseFromFinding(prId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.reviews(prId) });
  return useMutation({
    mutationFn: (findingId: string) => api.post<EvalCase>(`/findings/${findingId}/eval-case`),
    onSuccess: refresh,
    onError: (e) => {
      if ((e as { status?: number }).status === 409) refresh();
    },
  });
}

/* ---- Part 2 hooks ---- */

/** All-agents dashboard; polls while any agent has a running eval run. */
export function useEvalDashboard() {
  return useQuery({
    queryKey: queryKeys.evalDashboard(),
    queryFn: () => api.get<EvalDashboardResponse>("/eval/dashboard"),
    refetchInterval: (q) => (q.state.data?.agents.some((a) => a.has_running_run) ? EVAL_POLL_MS : false),
  });
}

/** Per-agent dashboard for a date range; polls while any run in the range is running. */
export function useAgentEvalDashboard(agentId: string | null | undefined, range: EvalRange) {
  return useQuery({
    queryKey: queryKeys.agentEvalDashboard(agentId, range),
    queryFn: () => api.get<AgentEvalDashboardResponse>(`/agents/${agentId}/eval-dashboard?range=${range}`),
    enabled: !!agentId,
    retry: false,
    refetchInterval: (q) => (q.state.data?.runs.some((r) => r.status === "running") ? EVAL_POLL_MS : false),
  });
}

/** Compare two runs; enabled only with both ids. A 422 surfaces as `error` for the caller to toast. */
export function useEvalCompare(a: string | null | undefined, b: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.evalCompare(a, b),
    queryFn: () => api.get<CompareResponse>(`/eval-runs/compare?a=${a}&b=${b}`),
    enabled: !!a && !!b,
    retry: false,
    // A promote changes `is_current_config`, so never serve a cached compare.
    gcTime: 0,
  });
}

/** Roll-forward promote of a version's config as a new agent version. */
export function usePromoteAgent(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PromoteBody) => api.post<PromoteResponse>(`/agents/${agentId}/promote`, body),
    onSuccess: (res) => {
      qc.setQueryData(queryKeys.agent(agentId), res.agent);
      qc.invalidateQueries({ queryKey: queryKeys.agents() });
      qc.invalidateQueries({ queryKey: queryKeys.agentEvalDashboard(agentId) });
      qc.invalidateQueries({ queryKey: ["eval-compare"] });
      qc.invalidateQueries({ queryKey: queryKeys.evalDashboard() });
    },
  });
}

/** "Run all agents": starts a run for every eligible agent. */
export function useRunAllAgents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<RunAllResponse>("/eval-runs/all"),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.evalDashboard() });
      qc.invalidateQueries({ queryKey: ["agent-eval-dashboard"] });
    },
  });
}
