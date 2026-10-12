/* PrBriefBlock — the PR Overview's "PR BRIEF": banner (verdict + summary + cost),
   the Intent card (its Risk areas are the brief's risk cards), Blast radius and
   "Review focus". Server state stays in the query cache (GET/POST /pulls/:id/brief);
   the view is derived each render. All model text is plain JSX text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useBrief, useGenerateBrief, type StoredBrief } from "@/lib/hooks/brief";
import { usePrReviews } from "@/lib/hooks/reviews";
import { useToast } from "@/lib/toast";
import { relativeTime } from "../../../helpers";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { IntentCard } from "../IntentCard";
import { VerdictBanner } from "../VerdictBanner";
import { BriefCostLine } from "./_components/BriefCostLine";
import { BriefEmptyState } from "./_components/BriefEmptyState";
import { BriefError } from "./_components/BriefError";
import { BriefNotices } from "./_components/BriefNotices";
import { BriefSkeleton } from "./_components/BriefSkeleton";
import { InfoTooltip } from "./_components/InfoTooltip";
import { RefreshControl } from "./_components/RefreshControl";
import { ReviewFocusCard } from "./_components/ReviewFocusCard";
import { RiskAreaList } from "./_components/RiskAreaList";
import { briefView, isInDiff, latestReviewBanner, refTarget } from "./helpers";
import { s } from "./styles";

const MISSING_KEY_CODE = "missing_api_key";
const CONFLICT_CODE = "generation_in_progress";

interface PrBriefBlockProps {
  prId: string | null;
  repoId: string | null | undefined;
  repoFullName: string | null;
  headSha: string;
  /** Paths of the PR's Files-changed tab; navigation targets must be among them. */
  diffPaths: string[];
  onOpenFile: (path: string, line: number | null) => void;
}

function errorCode(err: unknown): string | undefined {
  return err instanceof ApiError ? err.code : undefined;
}

export function PrBriefBlock({ prId, repoId, repoFullName, headSha, diffPaths, onOpenFile }: PrBriefBlockProps) {
  const t = useTranslations("brief");
  const toast = useToast();
  const query = useBrief(prId);
  const mutation = useGenerateBrief(prId);
  const { data: reviews } = usePrReviews(prId);

  const view = briefView({ query, mutation });
  const brief: StoredBrief | null = query.data?.brief ?? null;
  const stale = query.data?.stale ?? false;
  const generating = view === "firstGeneration" || view === "regenerating";
  const banner = React.useMemo(() => latestReviewBanner(reviews), [reviews]);

  // A 409 means another generation runs: the view shows "generating", no error.
  const failure = mutation.isError && errorCode(mutation.error) !== CONFLICT_CODE ? mutation.error : null;
  const missingKey = failure !== null && errorCode(failure) === MISSING_KEY_CODE;

  const generate = () => {
    const hadBrief = brief !== null;
    mutation.mutate(undefined, {
      onError: (err) => {
        const code = errorCode(err);
        if (code === CONFLICT_CODE) return;
        // A toast cannot hold the Settings link, so the inline message carries it too.
        if (hadBrief) {
          toast.error(
            code === MISSING_KEY_CODE
              ? `${t("panel.error.missingKeyBody")} ${t("panel.error.apiKeysLink")}`
              : t("panel.error.generic"),
          );
        }
      },
    });
  };

  const go = (path: string, line: number | null) => {
    if (isInDiff(path, diffPaths)) onOpenFile(path, line);
    else toast.info(t("panel.fileNotInDiff"));
  };

  const hasBriefView = view === "brief" || view === "regenerating";
  const riskSlot =
    hasBriefView && brief ? (
      <RiskAreaList
        risks={brief.risks.risks}
        onOpenRef={(ref) => {
          const target = refTarget(ref);
          go(target.path, target.line);
        }}
      />
    ) : undefined;

  const cards = (
    <div style={s.grid}>
      <IntentCard prId={prId} riskAreas={riskSlot} />
      <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
    </div>
  );

  // First generation: the Risk areas slot holds a placeholder instead of intent chips.
  const firstGenerationCards = (
    <div style={s.grid}>
      <IntentCard prId={prId} riskAreas={<div data-testid="risk-areas-skeleton"><Skeleton height={56} /></div>} />
      <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
    </div>
  );

  let body: React.ReactNode;
  if (view === "loading") {
    body = <BriefSkeleton />;
  } else if (view === "loadError") {
    body = (
      <>
        <BriefError kind="load" onRetry={() => query.refetch()} />
        {cards}
      </>
    );
  } else if (view === "firstGeneration") {
    body = (
      <BriefSkeleton busy>{firstGenerationCards}</BriefSkeleton>
    );
  } else if (view === "empty") {
    body = (
      <>
        {failure !== null && (
          <BriefError kind={missingKey ? "missingKey" : "generic"} onRetry={generate} />
        )}
        {(failure === null || missingKey) && <BriefEmptyState onGenerate={generate} />}
        {cards}
      </>
    );
  } else if (brief) {
    body = (
      <div style={s.content(view === "regenerating")} aria-busy={view === "regenerating" ? true : undefined}>
        {missingKey && <BriefError kind="missingKey" />}
        <VerdictBanner
          verdict={banner?.verdict ?? null}
          summary={brief.summary}
          score={banner?.score ?? null}
          findingsCount={banner?.findingsCount ?? 0}
          blockers={banner?.blockers ?? 0}
          info={
            banner ? (
              <InfoTooltip
                text={t("panel.verdictSource", {
                  agent: banner.agentName ?? "—",
                  relativeTime: relativeTime(banner.createdAt),
                })}
              />
            ) : undefined
          }
          action={<RefreshControl generating={generating} onClick={generate} />}
          scoreFooter={<BriefCostLine brief={brief} />}
        />
        <BriefNotices brief={brief} stale={stale} busy={generating} onRegenerate={generate} />
        {cards}
        <ReviewFocusCard items={brief.review_focus} onOpen={(path, line) => go(path, line)} />
      </div>
    );
  }

  return (
    <section>
      <SectionLabel icon="FileText">{t("panel.heading")}</SectionLabel>
      <div style={s.stack}>{body}</div>
    </section>
  );
}
