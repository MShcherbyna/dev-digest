/* hooks/ci.ts — React Query hooks for Export to CI: installations, CI runs,
   the wizard's preview/export/remove mutations and the pull-based auto-refresh.
   The wizard and the remove dialog render their own inline errors, so their
   mutations opt out of the global error toast (`meta.silentError`). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CiExport,
  CiExportInputBody,
  CiInstallation,
  CiPreview,
  CiPreviewInput,
  CiRefreshResult,
  CiRemoveResult,
  CiRun,
  CiRunsQueryInput,
} from "@devdigest/shared";
import { api, ApiError } from "../api";
import { queryKeys } from "./keys";

/** Auto-refresh cadence while the CI Runs page / CI tab stays open (AC-21). */
export const CI_REFRESH_MS = 60_000;

/** `?a=1&b=2` from the defined, non-empty entries (empty string when none). */
function toQueryString(query: CiRunsQueryInput): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** One agent's CI installations (status is derived on the server). */
export function useCiInstallations(agentId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.ciInstallations(agentId),
    queryFn: () => api.get<CiInstallation[]>(`/agents/${agentId}/ci/installations`),
    enabled: !!agentId,
  });
}

/** CI runs, newest first, narrowed by the filters. */
export function useCiRuns(query: CiRunsQueryInput) {
  return useQuery({
    queryKey: queryKeys.ciRuns(query),
    queryFn: () => api.get<CiRun[]>(`/ci-runs${toQueryString(query)}`),
  });
}

/** Wizard preview: generated files + secret status. Fired by the wizard's events, never cached. */
export function useCiPreview(agentId: string) {
  return useMutation({
    mutationFn: (input: CiPreviewInput) => api.post<CiPreview>(`/agents/${agentId}/ci/preview`, input),
    meta: { silentError: true },
  });
}

/** Install: opens/updates the `devdigest/ci` PR (mode `pr`) or records a zip install (`manual`). */
export function useExportCi(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CiExportInputBody) => api.post<CiExport>(`/agents/${agentId}/export-ci`, input),
    meta: { silentError: true },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.ciInstallationsAll() }),
  });
}

/** Remove: opens the removal PR; the installation turns `removing`. */
export function useRemoveCiInstallation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (installationId: string) => api.post<CiRemoveResult>(`/ci/installations/${installationId}/remove`),
    meta: { silentError: true },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.ciInstallationsAll() }),
  });
}

/** Outcome of one refresh. A GitHub/network failure is data (the banner), not a thrown error. */
interface CiRefreshOutcome {
  result: CiRefreshResult | null;
  error: ApiError | null;
}

/**
 * Pull-based ingest: POSTs `/ci-runs/refresh` on mount, every 60 s while the tab is visible and
 * on window focus, then refetches the runs and installations. The failure is folded into the
 * query's data so the global "query error" toast does not duplicate the inline banner.
 */
export function useCiAutoRefresh(agentId?: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.ciRefresh(agentId),
    queryFn: async (): Promise<CiRefreshOutcome> => {
      try {
        const result = await api.post<CiRefreshResult>("/ci-runs/refresh", agentId ? { agent_id: agentId } : undefined);
        void qc.invalidateQueries({ queryKey: queryKeys.ciRunsAll() });
        void qc.invalidateQueries({ queryKey: queryKeys.ciInstallationsAll() });
        return { result, error: null };
      } catch (e) {
        if (e instanceof ApiError) return { result: null, error: e };
        throw e;
      }
    },
    refetchInterval: CI_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const outcome = query.data;
  const error = outcome?.error ?? (query.error instanceof ApiError ? query.error : null);
  return {
    refresh: () => void query.refetch(),
    isRefreshing: query.isFetching,
    /** The refresh request itself failed (GitHub unreachable / rate limited / token rejected). */
    error,
    /** The request succeeded but some installations could not be refreshed. */
    hasPartialErrors: (outcome?.result?.errors.length ?? 0) > 0,
  };
}
