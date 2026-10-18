/* TargetStep — step 1: the CI target as a radio group (AC-3). Only GitHub Actions can be
   picked; the other cards are disabled "Coming soon" stubs. In `add-repository` mode it also
   asks for the repository, listing only repos where this agent is not installed yet (AC-2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, SelectInput } from "@devdigest/ui";
import type { CiTarget, Repo } from "@devdigest/shared";
import { IMPLEMENTED_TARGET, TARGETS } from "../../constants";
import { RadioOption } from "../RadioOption";
import { s } from "./styles";

export function TargetStep({
  target,
  onTarget,
  repoSelect,
}: {
  target: CiTarget;
  onTarget: (t: CiTarget) => void;
  /** Present in `add-repository` mode: the choices and the current pick. */
  repoSelect?: { options: Repo[]; value: string; onChange: (fullName: string) => void };
}) {
  const t = useTranslations("ci.exportWizard");
  return (
    <div>
      {repoSelect && (
        <div style={s.field}>
          {repoSelect.options.length === 0 ? (
            <p style={s.hint}>{t("repoNone")}</p>
          ) : (
            <label>
              <span style={s.fieldLabel}>{t("repoLabel")}</span>
              <SelectInput
                value={repoSelect.value}
                onChange={repoSelect.onChange}
                options={[
                  { value: "", label: t("repoSelectPlaceholder") },
                  ...repoSelect.options.map((r) => ({ value: r.full_name, label: r.full_name })),
                ]}
              />
            </label>
          )}
        </div>
      )}
      <div role="radiogroup" aria-label={t("targets.groupLabel")} style={s.grid}>
        {TARGETS.map((card) => {
          const Ico = Icon[card.icon];
          const stub = card.key !== IMPLEMENTED_TARGET;
          const checked = target === card.key;
          return (
            <RadioOption
              key={card.key}
              name="ci-target"
              value={card.key}
              checked={checked}
              disabled={stub}
              onSelect={(v) => onTarget(v as CiTarget)}
              style={s.card}
              checkedStyle={s.cardChecked}
            >
              <div style={s.head}>
                <div style={{ ...s.iconBox, ...(checked ? { color: "var(--accent)" } : null) }}>
                  <Ico size={18} />
                </div>
                <span style={s.name}>{t(`targets.${card.key}`)}</span>
                {card.recommended && (
                  <Badge color="var(--accent-text)" bg="var(--accent-bg)" style={{ marginLeft: "auto" }}>
                    {t("recommended")}
                  </Badge>
                )}
                {stub && (
                  <Badge color="var(--text-muted)" style={{ marginLeft: "auto" }}>
                    {t("comingSoon")}
                  </Badge>
                )}
              </div>
              <p style={s.desc}>{t(`targets.${card.key}Desc`)}</p>
            </RadioOption>
          );
        })}
      </div>
    </div>
  );
}
