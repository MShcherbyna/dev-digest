/* PromptDiff — line-level diff of the two runs' recorded system prompts. Plain text only
   (prompts are untrusted data); each change carries a screen-reader prefix besides its colour. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { diffLines } from "../../helpers";
import { s } from "./styles";

export function PromptDiff({
  promptA,
  promptB,
  versionA,
  versionB,
}: {
  promptA: string;
  promptB: string;
  versionA: number;
  versionB: number;
}) {
  const t = useTranslations("eval.compare");
  const lines = React.useMemo(() => diffLines(promptA, promptB), [promptA, promptB]);
  const identical = promptA === promptB;

  return (
    <div>
      <SectionLabel icon="FileText">{t("promptDiff")}</SectionLabel>
      {identical ? (
        <div style={s.identical}>{t("identical")}</div>
      ) : (
        <>
          <div style={s.legend}>
            <span style={s.legendItem}>
              <span style={s.swatch("var(--crit-bg, rgba(239,68,68,0.12))")} aria-hidden />
              {t("legendOld", { version: versionA })}
            </span>
            <span style={s.legendItem}>
              <span style={s.swatch("var(--ok-bg)")} aria-hidden />
              {t("legendNew", { version: versionB })}
            </span>
          </div>
          <div className="mono" style={s.block} data-testid="prompt-diff">
            {lines.map((l, i) => (
              <div key={i} style={s.line(l.type)}>
                {l.type !== "same" && <span style={s.srOnly}>{l.type === "add" ? t("added") : t("removed")} </span>}
                {l.text}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
