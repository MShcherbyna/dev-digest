/* FindingCard — ported from findings.jsx (createElement → TSX).
   Severity icon+label, category, file:line, confidence, markdown rationale +
   suggestion, accept/dismiss actions. Accept/dismiss reflect persisted
   timestamps. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Icon,
  SeverityBadge,
  CategoryTag,
  MonoLink,
  ConfidenceNum,
  Button,
  Markdown,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingActionKind } from "@devdigest/shared";
import type { EvalAwareFinding } from "@/lib/hooks/eval";
import { EvalCaseButton } from "./_components/EvalCaseButton";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "./constants";
import { lineLabel } from "./helpers";
import { useTranslateFinding, type TranslatedFinding } from "@/lib/hooks/translation";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

export function FindingCard({
  f,
  focused,
  defaultExpanded,
  onAction,
  pending,
  repoFullName,
  headSha,
  prId,
  agentId,
  showTranslate = true,
}: {
  f: EvalAwareFinding;
  focused?: boolean;
  defaultExpanded?: boolean;
  onAction?: (action: FindingActionKind, reply?: string) => void;
  pending?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** When set, the "Turn into eval case" action is shown. */
  prId?: string;
  agentId?: string | null;
  /** Hide the Translate action (AC-33: the Multi-Agent Review Tabs view shows
   * only Accept / Dismiss / Turn into eval case). Defaults to true so every
   * existing caller is unchanged. */
  showTranslate?: boolean;
}) {
  const t = useTranslations("prReview");
  const [expanded, setExpanded] = React.useState(defaultExpanded ?? false);
  const sevColor = SEV_COLOR[f.severity] ?? SEV_COLOR_FALLBACK;
  const fileHref =
    repoFullName && headSha
      ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
      : undefined;
  const accepted = !!f.accepted_at;
  const dismissed = !!f.dismissed_at;
  const muted = accepted || dismissed;
  // Per-finding translation state: fetched on demand, toggling back needs no request.
  const translate = useTranslateFinding(f.id);
  const [translation, setTranslation] = React.useState<TranslatedFinding | null>(null);
  const [showTranslated, setShowTranslated] = React.useState(false);
  const onTranslate = () => {
    if (showTranslated) return setShowTranslated(false);
    if (translation) return setShowTranslated(true);
    translate.mutate(undefined, {
      onSuccess: (r) => {
        setTranslation(r);
        setShowTranslated(true);
      },
    });
  };
  const shown = showTranslated ? translation : null;
  const title = shown?.title ?? f.title;
  const rationale = shown?.rationale ?? f.rationale;
  const suggestion = shown ? shown.suggestion : f.suggestion;

  return (
    <div data-finding-id={f.id} style={s.card(!!focused, sevColor)}>
      <div onClick={() => setExpanded((e) => !e)} style={{ ...s.header, ...s.dim(muted) }}>
        <div style={s.badgeWrap}>
          <SeverityBadge severity={f.severity as Severity} compact />
        </div>
        <div style={s.headerMain}>
          <div style={s.titleRow}>
            <span style={s.title(muted, dismissed)}>{title}</span>
            <CategoryTag category={f.category as Category} />
            {accepted && <span style={s.acceptedTag}>{t("finding.accepted")}</span>}
            {dismissed && <span style={s.dismissedTag}>{t("finding.dismissed")}</span>}
          </div>
          <div style={s.metaRow}>
            <MonoLink href={fileHref}>
              {f.file}:{lineLabel(f)}
            </MonoLink>
            <ConfidenceNum value={f.confidence} />
          </div>
        </div>
        <Icon.ChevronDown size={16} style={s.chevron(expanded)} />
      </div>

      {expanded && (
        <div style={s.body}>
          <div style={{ ...s.prose, ...s.dim(muted) }}>
            <Markdown>{rationale}</Markdown>
          </div>
          {suggestion && (
            <div style={{ ...s.suggestionWrap, ...s.dim(muted) }}>
              <div style={s.suggestionLabel}>{t("finding.suggestedFix")}</div>
              <div style={s.prose}>
                <Markdown>{suggestion}</Markdown>
              </div>
            </div>
          )}

          <div style={{ ...s.actions, ...s.dim(muted, 0.8) }}>
            <Button
              kind="secondary"
              size="sm"
              icon="Check"
              disabled={pending}
              active={accepted}
              onClick={() => onAction?.("accept")}
            >
              {t("finding.accept")}
            </Button>
            <Button
              kind="secondary"
              size="sm"
              icon="X"
              disabled={pending}
              active={dismissed}
              onClick={() => onAction?.("dismiss")}
            >
              {t("finding.dismiss")}
            </Button>
            {prId && <EvalCaseButton finding={f} prId={prId} agentId={agentId} />}
            {showTranslate && (
              <Button
                kind="secondary"
                size="sm"
                icon="Globe"
                loading={translate.isPending}
                active={showTranslated}
                onClick={onTranslate}
              >
                {showTranslated ? t("finding.showOriginal") : t("finding.translate")}
              </Button>
            )}
            {showTranslate && translate.isError && (
              <span style={s.translateError}>{t("finding.translateFailed")}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
