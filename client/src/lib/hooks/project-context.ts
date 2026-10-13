/* hooks/project-context.ts — Project Context: the discovery list of a repo's
   markdown docs, single-file preview, and the ordered attachments of an agent
   or a skill, one list per (agent|skill, repo). Every attachment call carries
   `?repo_id=`. Attachment writes are optimistic (new full list shown at once,
   rolled back on error; the global mutation handler raises the error toast). */
"use client";

import { queryKeys } from "./keys";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ContextFileContent, ContextListing, ContextPaths, ReindexAccepted } from "../types";

export const REINDEX_POLL_MS = 2000;
export const REINDEX_WAIT_MAX_MS = 150_000;

export function useProjectContext(repoId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.context(repoId),
    queryFn: () => api.get<ContextListing>(`/repos/${repoId}/context`),
    enabled: !!repoId,
    retry: false,
    // Poll while any trigger (button, clone, refresh) has the index building.
    refetchInterval: (query) => (query.state.data?.index.status === "indexing" ? REINDEX_POLL_MS : false),
  });
}

/** Start a re-index (202). Errors reach the global MutationCache toast. */
export function useReindexProjectContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<ReindexAccepted>(`/repos/${repoId}/context/reindex`),
    onSettled: (_data, _err, repoId) => {
      void qc.invalidateQueries({ queryKey: queryKeys.context(repoId) });
    },
  });
}

/** Content of one discovered doc; pass `enabled=false` until a preview is open. */
export function useContextFile(repoId: string | null | undefined, path: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.contextFile(repoId, path),
    queryFn: () => api.get<ContextFileContent>(`/repos/${repoId}/context/file?path=${encodeURIComponent(path ?? "")}`),
    enabled: !!repoId && !!path && enabled,
    retry: false,
  });
}

export function useAgentContext(id: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.agentContext(id, repoId),
    queryFn: () => api.get<ContextPaths>(`/agents/${id}/context?repo_id=${encodeURIComponent(repoId ?? "")}`),
    enabled: !!id && !!repoId,
  });
}

export function useSkillContext(id: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skillContext(id, repoId),
    queryFn: () => api.get<ContextPaths>(`/skills/${id}/context?repo_id=${encodeURIComponent(repoId ?? "")}`),
    enabled: !!id && !!repoId,
  });
}

interface SetContextVars {
  repoId: string;
  paths: string[];
}

/** Shared optimistic PUT of a whole ordered path list. URL and cache key come from the
    mutation variables, never the hook closure: a toggle in flight during a repo switch
    writes, rolls back and invalidates the repo that was active when it was made. */
function useSetContextPaths(kind: "agents" | "skills", id: string) {
  const qc = useQueryClient();
  const keyFor = (repoId: string) =>
    kind === "agents" ? queryKeys.agentContext(id, repoId) : queryKeys.skillContext(id, repoId);
  return useMutation({
    mutationFn: ({ repoId, paths }: SetContextVars) =>
      api.put<ContextPaths>(`/${kind}/${id}/context?repo_id=${encodeURIComponent(repoId)}`, { paths }),
    onMutate: async ({ repoId, paths }) => {
      const key = keyFor(repoId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ContextPaths>(key);
      qc.setQueryData<ContextPaths>(key, { paths });
      return { previous };
    },
    onError: (_err, { repoId }, ctx) => {
      if (ctx?.previous) qc.setQueryData(keyFor(repoId), ctx.previous);
    },
    onSettled: (_data, _err, { repoId }) => {
      void qc.invalidateQueries({ queryKey: keyFor(repoId) });
      // "used by" counts on the Project Context page depend on attachments.
      void qc.invalidateQueries({ queryKey: queryKeys.context(repoId) });
    },
  });
}

export function useSetAgentContext(id: string) {
  return useSetContextPaths("agents", id);
}

export function useSetSkillContext(id: string) {
  return useSetContextPaths("skills", id);
}
