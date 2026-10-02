/* BlastRadiusCard — the PR Brief "Blast radius" card (Tree view): stat row,
   collapsible symbols with file:line callers, endpoint + cron chips. Data comes
   from the precomputed repo-intel index via GET /pulls/:id/blast. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Skeleton } from "@devdigest/ui";
import { useBlastRadius, type BlastRadiusResponse } from "@/lib/hooks/blast";
import { blastStats } from "./helpers";
import { s } from "./styles";
import { SymbolTree } from "./_components/SymbolTree";
import { BlastGraph } from "./_components/BlastGraph";
import { PriorPrs } from "./_components/PriorPrs";
import { ResyncButton } from "./_components/ResyncButton";
import { RESYNCABLE_REASONS } from "./constants";

type View = "tree" | "graph";

interface BlastRadiusCardProps {
  prId: string | null | undefined;
  repoId: string | null | undefined;
  repoFullName: string | null;
  headSha: string;
}

function StatRow({
  data,
  view,
  onViewChange,
}: {
  data: BlastRadiusResponse;
  view: View;
  onViewChange: (v: View) => void;
}) {
  const t = useTranslations("blast");
  const stats = blastStats(data);
  const items = [
    { key: "symbols", Glyph: Icon.Code, count: stats.symbols },
    { key: "callers", Glyph: Icon.CornerDownRight, count: stats.callers },
    { key: "endpoints", Glyph: Icon.Globe, count: stats.endpoints },
    { key: "crons", Glyph: Icon.Clock, count: stats.crons },
  ] as const;
  return (
    <div style={s.statRow}>
      {items.map(({ key, Glyph, count }) => (
        <span key={key} style={s.stat}>
          <Glyph size={14} aria-hidden style={{ color: "var(--text-muted)" }} />
          <span style={s.statNum}>{count}</span>
          {t(`stat.${key}`, { count })}
        </span>
      ))}
      <div role="group" aria-label={t("view.label")} style={s.toggle}>
        {(["tree", "graph"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            style={s.toggleBtn(view === v)}
            onClick={() => onViewChange(v)}
          >
            {t(`view.${v}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BlastRadiusCard({ prId, repoId, repoFullName, headSha }: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const tb = useTranslations("brief");
  const { data, isLoading, isError, refetch } = useBlastRadius(prId);

  const [view, setView] = React.useState<View>("tree");
  const hasTree = !!data && data.downstream.length > 0;

  return (
    <section style={s.card} aria-label={tb("block.blast")}>
      <div style={s.header}>
        <Icon.Workflow size={16} aria-hidden />
        <span style={s.label}>{tb("block.blast")}</span>
      </div>

      {isLoading && (
        <div style={s.skeletons}>
          <Skeleton height={16} width="60%" />
          <Skeleton height={32} />
          <Skeleton height={32} />
        </div>
      )}

      {isError && (
        <div style={s.errorRow}>
          <span role="alert" style={s.muted}>
            {t("error")}
          </span>
          <Button size="sm" kind="secondary" onClick={() => refetch()}>
            {t("retry")}
          </Button>
        </div>
      )}

      {data?.degraded && data.reason && (
        <div role="status" style={s.notice}>
          <span>
            <span style={s.noticeTitle}>{t("degraded.title")}</span>
            {t(`degraded.${data.reason}`)}
          </span>
          {repoId && RESYNCABLE_REASONS.has(data.reason) && <ResyncButton repoId={repoId} />}
        </div>
      )}

      {data && hasTree && (
        <>
          <StatRow data={data} view={view} onViewChange={setView} />
          {view === "tree" ? (
            <SymbolTree data={data} repoFullName={repoFullName} headSha={headSha} />
          ) : (
            <BlastGraph data={data} repoFullName={repoFullName} headSha={headSha} />
          )}
        </>
      )}

      {data && !hasTree && !data.degraded && (
        <p style={s.muted}>{t("noDownstream", { count: data.changed_symbols.length })}</p>
      )}

      {/* History does not depend on the index, so it shows in both views and in every map state. */}
      <PriorPrs prId={prId} repoFullName={repoFullName} />
    </section>
  );
}
