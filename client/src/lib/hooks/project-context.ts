/* hooks/project-context.ts — Project Context: the discovery list of a repo's
   markdown docs, single-file preview, and the ordered attachments of an agent
   or a skill. Attachment writes are optimistic (new full list shown at once,
   rolled back on error; the global mutation handler raises the error toast). */
"use client";

import { queryKeys } from "./keys";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ContextFileContent, ContextListing, ContextPaths } from "../types";

export function useProjectContext(repoId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.context(repoId),
    queryFn: () => api.get<ContextListing>(`/repos/${repoId}/context`),
    enabled: !!repoId,
    retry: false,
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

export function useAgentContext(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.agentContext(id),
    queryFn: () => api.get<ContextPaths>(`/agents/${id}/context`),
    enabled: !!id,
  });
}

export function useSkillContext(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skillContext(id),
    queryFn: () => api.get<ContextPaths>(`/skills/${id}/context`),
    enabled: !!id,
  });
}

/** Shared optimistic PUT of a whole ordered path list. */
function useSetContextPaths(
  url: string,
  key: readonly unknown[],
  repoId: string | null | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) => api.put<ContextPaths>(url, { paths }),
    onMutate: async (paths) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ContextPaths>(key);
      qc.setQueryData<ContextPaths>(key, { paths });
      return { previous };
    },
    onError: (_err, _paths, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      // "used by" counts on the Project Context page depend on attachments.
      if (repoId) void qc.invalidateQueries({ queryKey: queryKeys.context(repoId) });
    },
  });
}

export function useSetAgentContext(id: string, repoId: string | null | undefined) {
  return useSetContextPaths(`/agents/${id}/context`, queryKeys.agentContext(id), repoId);
}

export function useSetSkillContext(id: string, repoId: string | null | undefined) {
  return useSetContextPaths(`/skills/${id}/context`, queryKeys.skillContext(id), repoId);
}
