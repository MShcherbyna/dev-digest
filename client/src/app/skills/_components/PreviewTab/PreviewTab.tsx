/* PreviewTab — the saved skill rendered as markdown, plus the exact block that
   lands in the agent prompt (`### <name>` under "Skills / rules"). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { Markdown, SectionLabel } from "@devdigest/ui";
import { buildPromptBlock } from "./helpers";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <section>
        <SectionLabel>{t("preview.rendered")}</SectionLabel>
        <div style={s.card}>{skill.body ? <Markdown>{skill.body}</Markdown> : t("preview.empty")}</div>
      </section>
      <section>
        <SectionLabel>{t("preview.promptBlock")}</SectionLabel>
        <div style={s.hint}>{t("preview.promptBlockHint")}</div>
        {skill.source !== "manual" && <div style={s.warn}>{t("preview.untrustedNote")}</div>}
        <pre className="mono" data-testid="prompt-block" style={s.pre}>
          {buildPromptBlock(skill)}
        </pre>
      </section>
    </div>
  );
}
