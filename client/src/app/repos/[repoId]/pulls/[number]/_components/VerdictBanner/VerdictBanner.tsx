/* VerdictBanner — ported from findings.jsx.
   request_changes / approve / comment + summary + finding/blocker counts + score. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, CircularScore } from "@devdigest/ui";
import type { Verdict } from "@devdigest/shared";
import { VERDICT_META } from "./constants";
import { s } from "./styles";

export function VerdictBanner({
  verdict,
  summary,
  score,
  findingsCount,
  blockers,
  agentName,
  info,
  action,
  scoreFooter,
}: {
  /** `null` = summary-only mode (PR Brief with no review yet): no icon, label, counts or score. */
  verdict: Verdict | null;
  summary: string | null;
  score: number | null;
  findingsCount: number;
  blockers: number;
  agentName?: string | null;
  /** Rendered right after the counts badge (the PR Brief's ⓘ tooltip). */
  info?: React.ReactNode;
  /** Top-right control before the score column (the PR Brief's refresh button). */
  action?: React.ReactNode;
  /** Rendered under the score column (the PR Brief's cost line). */
  scoreFooter?: React.ReactNode;
}) {
  const t = useTranslations("prReview");
  const m = verdict ? (VERDICT_META[verdict] ?? VERDICT_META.comment) : null;
  const VIcon = m ? Icon[m.icon] : null;
  const showScore = verdict !== null && score != null;
  return (
    <div style={s.wrap}>
      {m && VIcon && (
        <div style={s.iconBox(m.bg, m.c)}>
          <VIcon size={22} />
        </div>
      )}
      <div style={s.main}>
        {m && (
          <div style={s.titleRow}>
            <span style={s.label(m.c)}>{t(`verdict.${m.labelKey}`)}</span>
            <Badge color="var(--text-secondary)">
              {t("verdict.findingsCount", { count: findingsCount })}
              {blockers > 0 ? t("verdict.blockers", { count: blockers }) : ""}
            </Badge>
            {info}
            {agentName && (
              <Badge color="var(--accent-text)" bg="var(--accent-bg)" icon="Cpu">
                {agentName}
              </Badge>
            )}
          </div>
        )}
        {summary && <p style={m ? s.summary : s.summaryOnly}>{summary}</p>}
      </div>
      {action && <div style={s.action}>{action}</div>}
      {(showScore || scoreFooter) && (
        <div style={s.scoreCol}>
          {showScore && (
            <>
              <CircularScore score={score} size={52} stroke={5} />
              <span style={s.scoreLabel}>{t("verdict.prScore")}</span>
            </>
          )}
          {scoreFooter && <div style={s.scoreFooter}>{scoreFooter}</div>}
        </div>
      )}
    </div>
  );
}
