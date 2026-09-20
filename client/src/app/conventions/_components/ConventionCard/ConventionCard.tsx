/* ConventionCard — one extracted convention: rule (click to edit), evidence
   snippet with a GitHub link to the exact line, confidence bar, Accept/Reject. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, ProgressBar, Textarea } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import type { Convention } from "@/lib/hooks/conventions";
import { CONFIDENCE_BAR_WIDTH } from "./constants";
import { confidenceColor, confidencePct } from "./helpers";
import { s } from "./styles";

export function ConventionCard({
  convention: c,
  repoFullName,
  headSha,
  onAccept,
  onReject,
  onSaveRule,
}: {
  convention: Convention;
  repoFullName: string;
  headSha: string;
  onAccept: () => void;
  onReject: () => void;
  onSaveRule: (rule: string) => void;
}) {
  const t = useTranslations("conventions.card");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(c.rule);
  const pct = confidencePct(c.confidence);
  const canSave = draft.trim().length > 0 && draft.trim() !== c.rule;

  const startEdit = () => {
    setDraft(c.rule);
    setEditing(true);
  };
  const save = () => {
    onSaveRule(draft.trim());
    setEditing(false);
  };

  return (
    <article style={s.card(c.accepted)}>
      <div style={s.main}>
        {editing ? (
          <div>
            <Textarea value={draft} onChange={setDraft} rows={2} />
            <div style={s.editRow}>
              <Button kind="primary" size="sm" onClick={save} disabled={!canSave}>
                {t("save")}
              </Button>
              <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <button type="button" style={s.rule} onClick={startEdit} title={t("editRule")}>
            {c.rule}
          </button>
        )}

        <div style={s.evidence}>
          <div style={s.evidenceHead}>
            <span className="mono" style={s.path}>
              {c.evidence_path}
            </span>
            <a
              href={githubBlobUrl(repoFullName, headSha, c.evidence_path, c.evidence_line ?? undefined)}
              target="_blank"
              rel="noreferrer"
              style={s.link}
            >
              ↗ {t("github")}
            </a>
          </div>
          <pre className="mono" style={s.code(c.accepted)}>
            {c.evidence_snippet}
          </pre>
        </div>

        <div style={s.confidence}>
          <span>{t("confidence")}</span>
          <div style={{ width: CONFIDENCE_BAR_WIDTH }}>
            <ProgressBar value={pct} color={confidenceColor(c.confidence)} height={4} />
          </div>
          <span className="tnum">{pct}%</span>
        </div>
      </div>

      <div style={s.actions}>
        {c.accepted ? (
          <div style={s.acceptedLabel}>
            <Icon.Check size={14} />
            {t("accepted")}
          </div>
        ) : (
          <Button kind="primary" icon="Check" onClick={onAccept}>
            {t("accept")}
          </Button>
        )}
        <Button kind="secondary" icon="X" onClick={onReject}>
          {t("reject")}
        </Button>
      </div>
    </article>
  );
}
