/* hooks/repo-intel.ts — React Query hooks for the repo-intel (T3) index state.
   Mirrors hooks/context.ts (useIndexStatus/useReindex) but targets the
   repo-intel facade's HTTP surface:
     GET  /repos/:id/index-state  → RepoIntelState
     POST /repos/:id/resync       → fetch latest from origin + incremental
                                     reindex (202). NOT a destructive re-clone. */
"use client";

import { queryKeys } from "./keys";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

/** Subset of the server's IndexState the badge + completion-poll need (kept
    local — not in @devdigest/shared, since repo-intel types live server-side). */
export interface RepoIntelState {
  status: "full" | "partial" | "degraded" | "failed";
  filesIndexed: number;
  filesSkipped: number;
  /** Advances when a resync writes a new index row → the UI's completion signal. */
  lastIndexedSha: string;
  updatedAt: string;
  degraded?: boolean;
  degradedReason?: string;
  reason?: string;
}

/** GET /repos/:id/index-state → current repo-intel index state.
    While `poll` is true, refetch on an interval so a running resync's result
    becomes visible. The caller (ProjectContextView) owns when to stop polling
    (the status enum is terminal-only, so completion is detected by watching
    `lastIndexedSha`/`updatedAt` advance, not by status). */
export function useRepoIntelStatus(repoId: string | null | undefined, poll = false) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.repoIntelState(repoId),
    queryFn: () => api.get<RepoIntelState>(`/repos/${repoId}/index-state`),
    enabled: !!repoId,
    refetchInterval: poll ? 1500 : false,
  });

  // A resync is async (202): its completion is the index advancing. Blast radius
  // is derived from the index, so refetch it then (not merely when the POST returns).
  const sha = query.data?.lastIndexedSha;
  const seenSha = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (sha === undefined) return;
    if (seenSha.current !== undefined && seenSha.current !== sha) {
      qc.invalidateQueries({ queryKey: queryKeys.prBlastAll() });
    }
    seenSha.current = sha;
  }, [sha, qc]);

  return query;
}

/** POST /repos/:id/resync → fetch latest + incremental reindex (resync, not re-clone). */
export function useResyncRepoIntel(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ status: string }>(`/repos/${repoId}/resync`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.repoIntelState(repoId) });
      qc.invalidateQueries({ queryKey: queryKeys.prBlastAll() });
    },
  });
}

/** Safety net: stop waiting for a resync to show up in the index state after this long. */
export const RESYNC_POLL_MAX_MS = 120_000;

/**
 * Resync + wait for completion. The POST returns 202 before reindexing finishes, so
 * completion is the index state's `updatedAt` advancing (this also covers a resync that ends on
 * the same sha, which the `lastIndexedSha` effect misses). On completion the blast MAPS are
 * invalidated; prior-PR history (GitHub) is deliberately left alone.
 */
export function useResyncAndRefresh(repoId: string | null | undefined) {
  const qc = useQueryClient();
  const resync = useResyncRepoIntel(repoId);
  // null = idle; `{ since: null }` = started before the index state had loaded.
  const [wait, setWait] = React.useState<{ since: string | null } | null>(null);
  const waiting = wait !== null;
  const status = useRepoIntelStatus(repoId, waiting);
  const updatedAt = status.data?.updatedAt;

  const finished =
    wait?.since != null && updatedAt !== undefined && updatedAt !== wait.since;
  React.useEffect(() => {
    if (!waiting) return;
    if (finished) {
      qc.invalidateQueries({ queryKey: queryKeys.prBlastAll() });
      setWait(null);
      return;
    }
    const cap = setTimeout(() => {
      qc.invalidateQueries({ queryKey: queryKeys.prBlastAll() });
      setWait(null);
    }, RESYNC_POLL_MAX_MS);
    return () => clearTimeout(cap);
  }, [waiting, finished, qc]);

  // Started before the state loaded: the first value we see is the baseline.
  React.useEffect(() => {
    if (wait && wait.since === null && updatedAt !== undefined) setWait({ since: updatedAt });
  }, [wait, updatedAt]);

  return {
    start: () => {
      setWait({ since: status.data?.updatedAt ?? null });
      resync.mutate(undefined, { onError: () => setWait(null) });
    },
    pending: waiting && !finished,
    isError: resync.isError,
  };
}
