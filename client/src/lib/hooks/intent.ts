/* hooks/intent.ts — React Query hooks for the PR Intent layer.
   GET is a pure read (never generates). Generation is an explicit POST: the
   IntentCard fires `ifAbsent` once on first visit, then only the user's button
   ("regenerate"). The response shape is module-local on the server (not in
   @devdigest/shared), mirrored here. */
"use client";

import { queryKeys } from "./keys";
import { useQuery, useMutation, useQueryClient, useIsMutating } from "@tanstack/react-query";
import { api } from "../api";

export type IntentConfidence = "high" | "medium" | "low";
export type IntentDeriveMode = "ifAbsent" | "regenerate";

export interface IntentSource {
  kind: "title" | "description" | "branch" | "commits" | "files" | "issue" | "doc" | "link";
  ref: string;
  status: "used" | "unfetched" | "failed" | "truncated";
}

export interface PrIntent {
  pr_id: string;
  intent: string;
  in_scope: string[];
  out_of_scope: string[];
  risk_areas: string[];
  confidence: IntentConfidence;
  sources: IntentSource[];
  head_sha: string | null;
  derived_at: string;
  model: string | null;
  /** The PR head moved since the intent was derived. */
  stale: boolean;
}

interface IntentResponse {
  intent: PrIntent | null;
}

interface DeriveIntentResponse {
  intent: PrIntent;
  outcome: "existing" | "derived" | "reused";
}

/** Private: shared by the mutation and by `useIsDerivingIntent` (the auto-derive guard). */
const deriveIntentKey = (prId: string | null | undefined) => ["derive-intent", prId] as const;

/** Number of in-flight derive mutations for this PR (across all card instances). */
export function useIsDerivingIntent(prId: string | null | undefined): number {
  return useIsMutating({ mutationKey: deriveIntentKey(prId) });
}

/** Returns a function that refetches the stored intent for a PR (e.g. after a run finishes). */
export function useInvalidateIntent() {
  const qc = useQueryClient();
  return (prId: string | null | undefined) => qc.invalidateQueries({ queryKey: queryKeys.prIntent(prId) });
}

export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.prIntent(prId),
    queryFn: () => api.get<IntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

export function useDeriveIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: deriveIntentKey(prId),
    mutationFn: (mode: IntentDeriveMode) =>
      api.post<DeriveIntentResponse>(`/pulls/${prId}/intent/derive`, { mode }),
    onSuccess: (r) => qc.setQueryData<IntentResponse>(queryKeys.prIntent(prId), { intent: r.intent }),
  });
}
