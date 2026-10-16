"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import {
  DiffViewer,
  type DiffCommentApi,
  type DiffFindingsApi,
  type DiffTarget,
} from "@/components/diff-viewer";
import {
  usePrComments,
  useCreatePrComment,
  usePrSmartDiff,
  usePrReviews,
  useFindingAction,
} from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { SmartDiffGroups } from "./_components/SmartDiffGroups";
import { OrderHeader, type FileOrder } from "./_components/OrderHeader";
import { buildViewGroups, findingsByPath, latestReview, linesByPath, resolveDiffTarget } from "./helpers";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Deep link from the PR Brief (?file=&line=); unresolved → toast, normal view. */
  target?: DiffTarget | null;
}

export function DiffTab({ prId, filesCount, files, canComment, repoFullName, headSha, target }: DiffTabProps) {
  const t = useTranslations("prReview");
  const tBrief = useTranslations("brief");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: smartDiff } = usePrSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  const action = useFindingAction();
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  const [order, setOrder] = React.useState<FileOrder>("smart");

  const resolvedTarget = resolveDiffTarget(target, files);
  const targetKey = resolvedTarget ? `${resolvedTarget.path}:${resolvedTarget.line ?? ""}` : "none";
  // Raise the "not in diff" toast once per unresolvable target (a direct URL too).
  const warnedKey = React.useRef<string | null>(null);
  const missingKey = target && !resolvedTarget ? `${target.path}:${target.line ?? ""}` : null;
  React.useEffect(() => {
    if (missingKey === null || warnedKey.current === missingKey) return;
    warnedKey.current = missingKey;
    notify.info(tBrief("panel.fileNotInDiff"));
  }, [missingKey, tBrief]);

  const commentCount = comments?.length ?? 0;
  const totalAdditions = files.reduce((sum, f) => sum + (f.additions ?? 0), 0);
  const totalDeletions = files.reduce((sum, f) => sum + (f.deletions ?? 0), 0);

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const latest = React.useMemo(() => latestReview(reviews), [reviews]);

  const renderFinding = React.useCallback<DiffFindingsApi["renderFinding"]>(
    (f) => (
      <FindingCard
        f={f}
        defaultExpanded
        pending={action.isPending}
        repoFullName={repoFullName}
        headSha={headSha}
        prId={prId ?? undefined}
        agentId={latest?.agent_id}
        onAction={(a) => {
          if (prId) action.mutate({ findingId: f.id, action: a, prId });
        }}
      />
    ),
    [action, repoFullName, headSha, prId, latest],
  );

  const findings: DiffFindingsApi | undefined = React.useMemo(
    () =>
      smartDiff
        ? {
            linesByPath: linesByPath(smartDiff),
            byPath: findingsByPath(latest?.findings ?? []),
            renderFinding,
          }
        : undefined,
    [smartDiff, latest, renderFinding],
  );

  const viewGroups = React.useMemo(
    () => (smartDiff ? buildViewGroups(files, smartDiff) : []),
    [files, smartDiff],
  );

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          commentCount > 0 ? (
            <Button
              kind="ghost"
              size="sm"
              icon={showComments ? "EyeOff" : "Eye"}
              onClick={() => setShowComments((v) => !v)}
            >
              {showComments ? t("smartDiff.hideComments") : t("smartDiff.showComments")} ({commentCount})
            </Button>
          ) : undefined
        }
      >
        {t("smartDiff.filesChanged", { count: filesCount })}
      </SectionLabel>

      <OrderHeader
        filesCount={filesCount}
        additions={totalAdditions}
        deletions={totalDeletions}
        order={order}
        onOrderChange={setOrder}
      />

      {order === "smart" && smartDiff ? (
        <SmartDiffGroups
          key={targetKey}
          groups={viewGroups}
          target={resolvedTarget}
          reviewed={!!latest}
          commenting={commenting}
          findings={findings}
        />
      ) : (
        <DiffViewer
          key={targetKey}
          files={files}
          commenting={commenting}
          findings={findings}
          target={resolvedTarget}
        />
      )}
    </section>
  );
}
