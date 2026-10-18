/* hooks/multi-agent.ts — Multi-Agent Review (L07) data layer. One shared
   query hook (`useMultiAgentRun`) serves both the Columns and Tabs views
   (R5 of the implementation plan). All requests go through `api`/`apiFetch`;
   components never call `fetch` directly. */
"use client";

import React from "react";
import { queryKeys } from "./keys";
import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { AgentUsageStats } from "@devdigest/shared";
import type { LastSelectionResponse, MultiAgentRunView } from "../types";

/** Polls while the run is still in flight (AC-18 / R8: the client-side
 * fallback for a dropped SSE stream — see the plan's "Lane C - step 11"). */
export function useMultiAgentRun(runId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.multiAgentRun(runId),
    queryFn: () => api.get<MultiAgentRunView>(`/multi-agent-runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (q) => (q.state.data?.status === "running" ? 2500 : false),
  });

  const runningRunIds = React.useMemo(
    () => (query.data?.columns ?? []).filter((c) => c.status === "running").map((c) => c.run_id),
    [query.data],
  );

  /** Call when a column's own SSE stream ends — refreshes this run and the
   * PR's persisted reviews (findings) without waiting for the next poll. */
  const onChildStreamEnded = React.useCallback(() => {
    if (!runId) return;
    qc.invalidateQueries({ queryKey: queryKeys.multiAgentRun(runId) });
    if (query.data?.pr_id) qc.invalidateQueries({ queryKey: queryKeys.reviews(query.data.pr_id) });
  }, [qc, runId, query.data?.pr_id]);

  return { ...query, runningRunIds, onChildStreamEnded };
}

/** Latest multi-agent run for a PR, or `null` when none exists yet (404). */
export function useLatestPrMultiAgentRun(prId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.prLatestMultiAgent(prId),
    queryFn: async () => {
      try {
        return await api.get<MultiAgentRunView>(`/pulls/${prId}/multi-agent`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    enabled: !!prId,
  });
}

export function useStartMultiAgentRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentIds }: { prId: string; agentIds: string[] }) =>
      api.post<MultiAgentRunView>(`/pulls/${prId}/multi-agent-run`, { agent_ids: agentIds }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.multiAgentRun(data.id), data);
      qc.invalidateQueries({ queryKey: queryKeys.prLatestMultiAgent(data.pr_id) });
      qc.invalidateQueries({ queryKey: queryKeys.prRuns(data.pr_id) });
    },
  });
}

export function useCancelMultiAgentRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<MultiAgentRunView>(`/multi-agent-runs/${id}/cancel`),
    onSuccess: (data) => qc.setQueryData(queryKeys.multiAgentRun(data.id), data),
  });
}

export function useCancelMultiAgentChild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, runId }: { id: string; runId: string }) =>
      api.post<MultiAgentRunView>(`/multi-agent-runs/${id}/runs/${runId}/cancel`),
    onSuccess: (data) => qc.setQueryData(queryKeys.multiAgentRun(data.id), data),
  });
}

export function useRetryMultiAgentChild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, runId }: { id: string; runId: string }) =>
      api.post<MultiAgentRunView>(`/multi-agent-runs/${id}/runs/${runId}/retry`),
    onSuccess: (data) => qc.setQueryData(queryKeys.multiAgentRun(data.id), data),
  });
}

/** Agent ids selected on the latest multi-run of any PR in this repo (Q-6),
 * already filtered server-side to currently-enabled agents. */
export function useLastAgentSelection(repoId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.repoLastSelection(repoId),
    queryFn: () => api.get<LastSelectionResponse>(`/repos/${repoId}/multi-agent/last-selection`),
    enabled: !!repoId,
  });
}

/** Per-agent cost/duration estimates for the picker + configure screens.
 * A failing query (e.g. agent never run) just means "no estimate" — never
 * surfaced as an error. */
export function useAgentEstimates(agentIds: string[]) {
  const results = useQueries({
    queries: agentIds.map((id) => ({
      queryKey: queryKeys.agentStats(id),
      queryFn: () => api.get<AgentUsageStats>(`/agents/${id}/stats`),
    })),
  });
  return React.useMemo(() => {
    const map: Record<string, AgentUsageStats | null> = {};
    agentIds.forEach((id, i) => {
      map[id] = results[i]?.isSuccess ? (results[i]!.data as AgentUsageStats) : null;
    });
    return map;
  }, [agentIds, results]);
}
