/* SkillBodyEditor — monospace textarea with line numbers, a `<name>.md` chip,
   an `unsaved` marker and a live token estimate (ceil(chars / 4)). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import { estimateTokens } from "@/lib/skill-format";
import { fileStem, lineNumbers } from "./helpers";
import { s } from "./styles";

export function SkillBodyEditor({
  value,
  savedValue,
  name,
  onChange,
}: {
  value: string;
  /** Last persisted body; drives the `unsaved` marker. */
  savedValue: string;
  name: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations("skills");
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const unsaved = value !== savedValue;

  return (
    <div style={s.wrap}>
      <div style={s.bar}>
        <span className="mono" style={s.chip}>
          {t("editor.fileChip", { name: fileStem(name) })}
        </span>
        {unsaved && <Badge color="var(--warn)">{t("editor.unsaved")}</Badge>}
        <span className="mono tnum" style={s.tokens}>
          {t("editor.tokens", { count: estimateTokens(value) })}
        </span>
      </div>
      <div style={s.body}>
        <div ref={gutterRef} aria-hidden="true" className="mono" style={s.gutter}>
          {lineNumbers(value).map((n) => (
            <div key={n}>{n}</div>
          ))}
        </div>
        <textarea
          className="mono"
          aria-label={t("editor.ariaLabel")}
          value={value}
          placeholder={t("editor.placeholder")}
          wrap="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          style={s.textarea}
        />
      </div>
    </div>
  );
}
