/* hooks/conventions.ts — React Query hooks for the Conventions extractor
   (scan a repo, accept/edit/reject candidates, merge accepted ones into a skill). */
"use client";

import { queryKeys } from "./keys";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Skill } from "@devdigest/shared";

export interface Convention {
  id: string;
  rule: string;
  evidence_path: string;
  evidence_snippet: string;
  evidence_line: number | null;
  confidence: number;
  accepted: boolean;
}

/** `head_sha` pins the GitHub evidence links to the scanned commit. */
export interface ConventionList {
  head_sha: string;
  conventions: Convention[];
}

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.conventions(repoId),
    queryFn: () => api.get<ConventionList>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionList>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => qc.setQueryData(queryKeys.conventions(repoId), data),
  });
}

/** Accept/un-accept and/or edit the rule text. */
export function useUpdateConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { accepted?: boolean; rule?: string } }) =>
      api.patch<Convention>(`/conventions/${id}`, patch),
    onSuccess: (updated) =>
      qc.setQueryData<ConventionList>(queryKeys.conventions(repoId), (old) =>
        old
          ? { ...old, conventions: old.conventions.map((c) => (c.id === updated.id ? updated : c)) }
          : old,
      ),
  });
}

/** Reject = delete for good. */
export function useRejectConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: true }>(`/conventions/${id}`).then(() => id),
    onSuccess: (id) =>
      qc.setQueryData<ConventionList>(queryKeys.conventions(repoId), (old) =>
        old ? { ...old, conventions: old.conventions.filter((c) => c.id !== id) } : old,
      ),
  });
}

export interface CreateSkillFromConventionsInput {
  name: string;
  description: string;
  /** The (possibly edited) skill text. */
  body: string;
  convention_ids: string[];
}

export function useCreateSkillFromConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillFromConventionsInput) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: (skill) => {
      qc.invalidateQueries({ queryKey: queryKeys.skills() });
      qc.setQueryData(queryKeys.skill(skill.id), skill);
    },
  });
}
