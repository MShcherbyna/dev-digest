/* ConfigureStep — step 3: triggers (AC-10), expected secrets and their status (AC-11),
   how results are posted (AC-12) and the "block merges" note. A change regenerates the
   workflow unless the user edited it; then the edit is kept and a warning shows (AC-9). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { CiPostAs, CiPreview, CiTrigger } from "@devdigest/shared";
import { POST_AS_OPTIONS, SECRET_STYLE, TRIGGER_ORDER } from "../../constants";
import { RadioOption } from "../RadioOption";
import { s } from "./styles";

export function ConfigureStep({
  triggers,
  onToggleTrigger,
  postAs,
  onPostAs,
  secrets,
  secretsPending,
  workflowEdited,
}: {
  triggers: CiTrigger[];
  onToggleTrigger: (t: CiTrigger) => void;
  postAs: CiPostAs;
  onPostAs: (p: CiPostAs) => void;
  /** `null` while the preview is being regenerated. */
  secrets: CiPreview["secrets"] | null;
  secretsPending: boolean;
  workflowEdited: boolean;
}) {
  const t = useTranslations("ci.exportWizard");
  return (
    <div style={s.wrap}>
      <div style={s.group}>
        <div style={s.label} id="ci-trigger-label">
          {t("triggerLabel")}
        </div>
        <div role="group" aria-labelledby="ci-trigger-label" style={s.chips}>
          {TRIGGER_ORDER.map((trigger) => {
            const on = triggers.includes(trigger);
            return (
              <button
                key={trigger}
                type="button"
                aria-pressed={on}
                onClick={() => onToggleTrigger(trigger)}
                style={{ ...s.chip, ...(on ? s.chipOn : null) }}
              >
                {on && <Icon.Check size={13} />}
                {`pull_request:${trigger}`}
              </button>
            );
          })}
        </div>
        {triggers.length === 0 && <div style={s.hint}>{t("triggersRequired")}</div>}
        {workflowEdited && <div style={s.warn}>{t("workflowEditedWarning")}</div>}
      </div>

      <div style={s.group}>
        <div style={s.label}>{t("secretsLabel")}</div>
        {secrets && !secretsPending ? (
          <div style={s.secrets}>
            {secrets.map((secret, i) => {
              const style = SECRET_STYLE[secret.status];
              return (
                <div
                  key={secret.name}
                  style={{ ...s.secretRow, borderBottom: i < secrets.length - 1 ? "1px solid var(--border)" : "none" }}
                >
                  <span className="mono" style={s.secretName}>
                    {secret.name}
                  </span>
                  <div style={s.secretDesc}>
                    {t.has(`secretDesc.${secret.name}`) ? t(`secretDesc.${secret.name}`) : null}
                    {secret.status === "unknown" && <div>{t("secretUnknownHint")}</div>}
                  </div>
                  <Badge color={style.color} bg={style.bg} dot>
                    {t(`secretStatus.${secret.status}`)}
                  </Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={s.state}>{t("generating")}</div>
        )}
        <div style={s.hint}>{t("secretsNote")}</div>
      </div>

      <div style={s.group}>
        <div style={s.label} id="ci-post-as-label">
          {t("postResultsLabel")}
        </div>
        <div role="radiogroup" aria-labelledby="ci-post-as-label" style={s.radios}>
          {POST_AS_OPTIONS.map((o) => {
            const checked = postAs === o.value;
            return (
              <RadioOption
                key={o.value}
                name="ci-post-as"
                value={o.value}
                checked={checked}
                onSelect={(v) => onPostAs(v as CiPostAs)}
                style={s.radio}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ ...s.radioDot, ...(checked ? { borderColor: "var(--accent)" } : null) }}>
                    {checked && <span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--accent)" }} />}
                  </span>
                  {t(`postAs.${o.key}`)}
                  {o.recommended && (
                    <Badge color="var(--accent-text)" bg="var(--accent-bg)">
                      {t("recommended")}
                    </Badge>
                  )}
                </span>
              </RadioOption>
            );
          })}
        </div>
      </div>

      <div style={s.note}>
        <Icon.Info size={15} style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: 2 }} />
        <span>{t.rich("blockMergeNote", { b: (chunks) => <b style={s.strong}>{chunks}</b> })}</span>
      </div>
    </div>
  );
}
