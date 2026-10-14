/* useReindexFlow — drives the Re-index button: waits for the server-side job to
   finish (the listing's index state advancing), toasts on failure, and gives up
   after REINDEX_WAIT_MAX_MS. Success shows no toast; the list and footer update. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { notify } from "@/lib/toast";
import { REINDEX_WAIT_MAX_MS, useReindexProjectContext } from "@/lib/hooks/project-context";
import type { ContextListing } from "@/lib/types";

interface Wait {
  repoId: string;
  since: { indexedAt: string | null; failedAt: string | null };
  sawIndexing: boolean;
}

export function useReindexFlow(repoId: string, listing: ContextListing | undefined) {
  const t = useTranslations("context");
  const reindex = useReindexProjectContext();
  const { mutate } = reindex;
  const [wait, setWait] = React.useState<Wait | null>(null);
  const [gaveUp, setGaveUp] = React.useState(false);

  const activeWait = wait && wait.repoId === repoId ? wait : null;
  const index = listing?.index;
  const serverIndexing = index?.status === "indexing";
  // Baseline comparison also catches a job that ended before the first poll.
  const finished =
    !!activeWait &&
    !!index &&
    !serverIndexing &&
    (index.indexed_at !== activeWait.since.indexedAt ||
      (index.failed_at ?? null) !== activeWait.since.failedAt ||
      activeWait.sawIndexing);
  const failed = finished && !!index && (index.status === "failed" || (index.failed_at ?? null) !== activeWait.since.failedAt);

  React.useEffect(() => {
    if (!activeWait) return;
    if (serverIndexing && !activeWait.sawIndexing) {
      setWait({ ...activeWait, sawIndexing: true });
      return;
    }
    if (finished) {
      if (failed) notify.error(t("reindex.failed"));
      setWait(null);
    }
  }, [activeWait, serverIndexing, finished, failed, t]);

  const waiting = activeWait !== null;
  React.useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      notify.error(t("reindex.timeout"));
      setWait(null);
      setGaveUp(true);
    }, REINDEX_WAIT_MAX_MS);
    return () => clearTimeout(timer);
  }, [waiting, t]);

  React.useEffect(() => {
    if (!serverIndexing) setGaveUp(false);
  }, [serverIndexing]);

  const start = React.useCallback(() => {
    setGaveUp(false);
    setWait({
      repoId,
      since: { indexedAt: index?.indexed_at ?? null, failedAt: index?.failed_at ?? null },
      sawIndexing: false,
    });
    mutate(repoId, { onError: () => setWait(null) });
  }, [repoId, index, mutate]);

  const running = !gaveUp && (serverIndexing || waiting);
  return { start, running, gaveUp };
}
