/* IntentCard — the PR Brief "Intent" card: one-sentence intent, IN SCOPE /
   OUT OF SCOPE lists, RISK AREAS chips, confidence tag, Derive/Regenerate button. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Skeleton } from "@devdigest/ui";
import type { PrIntent } from "@/lib/hooks/intent";
import { confidenceColor, riskLook } from "./helpers";
import { s } from "./styles";
import { useIntentCard } from "./use-intent-card";

function ScopeList({ items, color }: { items: string[]; color: string }) {
  return (
    <ul style={s.list}>
      {items.map((item) => (
        <li key={item} style={s.item(color)}>
          <span aria-hidden style={s.bullet}>
            &middot;
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function IntentBody({ intent }: { intent: PrIntent }) {
  const t = useTranslations("brief.intent");
  return (
    <>
      <blockquote style={s.quote}>&ldquo;{intent.intent}&rdquo;</blockquote>

      {(intent.in_scope.length > 0 || intent.out_of_scope.length > 0) && (
        <div style={s.columns}>
          <div>
            {intent.in_scope.length > 0 && (
              <>
                <div style={s.colTitle("var(--ok)")}>
                  <Icon.Check size={12} />
                  {t("inScope")}
                </div>
                <ScopeList items={intent.in_scope} color="var(--text-secondary)" />
              </>
            )}
          </div>
          <div>
            {intent.out_of_scope.length > 0 && (
              <>
                <div style={s.colTitle("var(--text-muted)")}>
                  <Icon.X size={12} />
                  {t("outOfScope")}
                </div>
                <ScopeList items={intent.out_of_scope} color="var(--text-muted)" />
              </>
            )}
          </div>
        </div>
      )}

      {intent.risk_areas.length > 0 && (
        <div>
          <div style={s.colTitle("var(--text-muted)")}>
            <Icon.AlertTriangle size={12} />
            {t("riskAreas")}
          </div>
          <div style={s.chips}>
            {intent.risk_areas.map((risk) => {
              const look = riskLook(risk);
              const RiskIcon = Icon[look.icon];
              return (
                <span key={risk} style={s.chip}>
                  <RiskIcon size={12} style={{ color: look.color }} />
                  {risk}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {intent.confidence === "low" && <div style={s.muted}>{t("lowConfidenceHint")}</div>}
    </>
  );
}

export function IntentCard({ prId }: { prId: string | null | undefined }) {
  const t = useTranslations("brief");
  const { state, intent, regenerate, isGenerating: generating, error } = useIntentCard(prId);
  const hasIntent = intent !== null;

  return (
    <section style={s.card(generating && hasIntent)} aria-busy={generating}>
      <div style={s.header}>
        <Icon.Target size={14} style={{ color: "var(--text-muted)" }} />
        <span style={s.label}>{t("block.intent")}</span>
        {hasIntent && !generating && (
          <span style={s.tag(confidenceColor(intent.confidence))}>
            {t(`intent.confidence.${intent.confidence}`)}
          </span>
        )}
        <div style={s.action}>
          {state === "stale" && <span style={s.muted}>{t("intent.stale")}</span>}
          {state !== "loading" && (
            <Button size="sm" kind="secondary" disabled={generating} loading={generating} onClick={regenerate}>
              {!hasIntent && error !== null
                ? t("intent.retry")
                : hasIntent
                  ? t("intent.regenerate")
                  : t("intent.derive")}
            </Button>
          )}
        </div>
      </div>

      {state === "loading" && (
        <div style={s.skeletons}>
          <Skeleton height={16} width="80%" />
          <Skeleton height={12} width="55%" />
          <Skeleton height={12} width="45%" />
        </div>
      )}

      {(state === "empty" || generating) && (
        <div style={s.muted}>{t("intent.generating")}</div>
      )}

      {/* A failed regenerate keeps the previous intent below; the global mutation
          handler already raised the toast, so this is the inline half only. */}
      {error !== null && !generating && (
        <div style={s.muted} role="alert">
          {error ? t("intent.errorWithReason", { message: error }) : t("intent.error")}
        </div>
      )}

      {hasIntent && <IntentBody intent={intent} />}
    </section>
  );
}
