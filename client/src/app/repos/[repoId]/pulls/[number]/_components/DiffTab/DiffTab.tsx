"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingsApi } from "@/components/diff-viewer";
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
import { buildViewGroups, findingsByPath, latestReview, linesByPath } from "./helpers";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
}

export function DiffTab({ prId, filesCount, files, canComment, repoFullName, headSha }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: smartDiff } = usePrSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  const action = useFindingAction();
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  const [order, setOrder] = React.useState<FileOrder>("smart");

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
        onAction={(a) => {
          if (prId) action.mutate({ findingId: f.id, action: a, prId });
        }}
      />
    ),
    [action, repoFullName, headSha, prId],
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
          groups={viewGroups}
          reviewed={!!latest}
          commenting={commenting}
          findings={findings}
        />
      ) : (
        <DiffViewer files={files} commenting={commenting} findings={findings} />
      )}
    </section>
  );
}
