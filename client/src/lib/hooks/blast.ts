/* hooks/blast.ts — React Query hook for a PR's blast radius.
   GET /pulls/:id/blast is a pure read over the precomputed repo-intel index (no
   LLM, no writes). The response shape is module-local on the server (the vendored
   BlastRadius contract has no degradation fields), mirrored here like hooks/intent.ts. */
"use client";

import type { BlastRadius, PrHistory } from "@devdigest/shared";
import { queryKeys } from "./keys";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export type BlastReason =
  | "flag_off"
  | "index_failed"
  | "index_partial"
  | "repo_too_large"
  | "no_data"
  | "no_changed_files";

export type BlastRadiusResponse = BlastRadius & {
  degraded: boolean;
  reason: BlastReason | null;
  /** Commit the index (and so every caller line) was built from; null when unknown. */
  ref_sha: string | null;
};

export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.prBlast(prId),
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}

/** GET /pulls/:id/blast/history — `available:false` = GitHub could not be consulted. */
export type PriorPrsResponse = PrHistory & { available: boolean };

const PRIOR_PRS_STALE_MS = 10 * 60_000;

export function usePriorPrs(prId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.prBlastHistory(prId),
    queryFn: () => api.get<PriorPrsResponse>(`/pulls/${prId}/blast/history`),
    enabled: !!prId,
    staleTime: PRIOR_PRS_STALE_MS,
    retry: false,
  });
}
