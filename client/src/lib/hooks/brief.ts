/* hooks/brief.ts — React Query hooks for the PR Brief.
   GET /pulls/:id/brief is a pure read (never generates); generation is the
   explicit POST /pulls/:id/brief/generate. The stored shape is module-local on
   the server (server/src/modules/brief/schemas.ts `StoredBrief`/`BriefState`;
   vendor/shared is do-not-touch), so it is hand-mirrored here — keep the field
   names identical. `PrBrief` itself comes from @devdigest/shared. */
"use client";

import type { PrBrief } from "@devdigest/shared";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { queryKeys } from "./keys";

export type StoredBrief = PrBrief & {
  head_sha: string;
  generated_at: string;
  provider: string;
  model: string;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  spec_docs: string[];
  truncated: boolean;
  files_total: number;
  /** The "shown" count of the truncation note. */
  files_sent: number;
};

export interface BriefState {
  brief: StoredBrief | null;
  stale: boolean;
  generating: boolean;
}

/** Poll interval while a generation runs (the server owns the in-flight flag). */
const GENERATING_POLL_MS = 3000;

export function useBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.prBrief(prId),
    queryFn: () => api.get<BriefState>(`/pulls/${prId}/brief`),
    enabled: !!prId,
    retry: false,
    refetchInterval: (q) => (q.state.data?.generating ? GENERATING_POLL_MS : false),
  });
}

/** Errors are handled by the view (toast vs inline link), hence `silentError`. */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  const key = queryKeys.prBrief(prId);
  return useMutation({
    mutationFn: () => api.post<{ brief: StoredBrief }>(`/pulls/${prId}/brief/generate`),
    meta: { silentError: true },
    onMutate: () => {
      qc.setQueryData<BriefState>(key, (old) => (old ? { ...old, generating: true } : old));
    },
    onSuccess: ({ brief }) => {
      qc.setQueryData<BriefState>(key, { brief, stale: false, generating: false });
    },
    onError: (err) => {
      // 409: another generation is running — the server still owns the flag, so
      // keep showing "generating" (the refetch below picks up its result).
      const running = err instanceof ApiError && err.code === "generation_in_progress";
      qc.setQueryData<BriefState>(key, (old) => (old ? { ...old, generating: running } : old));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
