/* hooks/onboarding.ts — types for the per-repository Onboarding Tour.
   Hand-mirrored from the server schemas in
   server/src/modules/onboarding/schemas.ts (module-local; vendor/shared is
   do-not-touch). Keep the field names identical. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { queryKeys } from "./keys";


export type OnboardingNodeKind = "entry" | "service" | "middleware" | "storage" | "external";
export type OnboardingComplexity = "low" | "medium" | "high";
export type OnboardingPathKind = "file" | "directory" | "new_file";
export type OnboardingIndexStatus = "full" | "partial" | "degraded" | "failed" | "none";

export interface OnboardingDiagram {
  nodes: { id: string; label: string; kind: OnboardingNodeKind }[];
  edges: { from: string; to: string }[];
}

export interface OnboardingTour {
  repo_id: string;
  generated_at: string;
  commit_sha: string;
  files_indexed: number;
  partial_index: boolean;
  architecture: {
    summary: string;
    diagram: OnboardingDiagram | null;
  };
  critical_paths: { path: string; description: string }[];
  run_locally: { command: string }[];
  reading_path: { path: string; reason: string }[];
  first_tasks: {
    title: string;
    path: string;
    path_kind: OnboardingPathKind;
    complexity: OnboardingComplexity;
  }[];
}

export interface OnboardingState {
  cloned: boolean;
  generating: boolean;
  index: {
    status: OnboardingIndexStatus;
    last_indexed_sha: string | null;
    files_indexed: number;
  };
  stale: boolean;
  tour: OnboardingTour | null;
}

/** Poll interval while a generation runs (the server owns the in-flight flag). */
const GENERATING_POLL_MS = 3000;

export function useOnboarding(repoId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.onboarding(repoId),
    queryFn: () => api.get<OnboardingState>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    retry: false,
    refetchInterval: (q) => (q.state.data?.generating ? GENERATING_POLL_MS : false),
  });
}

/** Errors are handled by the view (toast vs inline), hence `silentError`. */
export function useGenerateOnboarding(repoId: string | null | undefined) {
  const qc = useQueryClient();
  const key = queryKeys.onboarding(repoId);
  return useMutation({
    mutationFn: () => api.post<{ tour: OnboardingTour }>(`/repos/${repoId}/onboarding`),
    meta: { silentError: true },
    onMutate: () => {
      qc.setQueryData<OnboardingState>(key, (old) => (old ? { ...old, generating: true } : old));
    },
    onSuccess: ({ tour }) => {
      qc.setQueryData<OnboardingState>(key, (old) =>
        old ? { ...old, tour, generating: false, stale: false } : old,
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
