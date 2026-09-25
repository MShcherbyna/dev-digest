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
  const [order, setOrder] = React.useState<"smart" | "original">("smart");

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
              {showComments ? "Hide comments" : "Show comments"} ({commentCount})
            </Button>
          ) : undefined
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>

      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            marginBottom: 6,
          }}
        >
          Reviewer-ordered diff
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
            {filesCount} files · +{totalAdditions} −{totalDeletions}
          </span>
          <span style={{ flex: 1 }} />
          <div
            role="group"
            aria-label={t("smartDiff.orderToggleLabel")}
            style={{
              display: "inline-flex",
              border: "1px solid var(--border)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <Button
              kind="ghost"
              size="sm"
              active={order === "smart"}
              onClick={() => setOrder("smart")}
            >
              {t("smartDiff.smartOrder")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              active={order === "original"}
              onClick={() => setOrder("original")}
            >
              {t("smartDiff.originalOrder")}
            </Button>
          </div>
        </div>
      </div>

      {order === "smart" && smartDiff ? (
        <SmartDiffGroups groups={viewGroups} commenting={commenting} findings={findings} />
      ) : (
        <DiffViewer files={files} commenting={commenting} findings={findings} />
      )}
    </section>
  );
}
