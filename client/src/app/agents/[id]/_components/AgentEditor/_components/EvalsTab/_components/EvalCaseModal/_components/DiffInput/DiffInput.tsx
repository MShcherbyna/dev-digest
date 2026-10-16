/* DiffInput — the case's unified diff as plain monospace text (never rendered as HTML). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s } from "../../styles";

export function DiffInput({
  value,
  onChange,
  error,
  readOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  readOnly?: boolean;
}) {
  const t = useTranslations("eval.caseEditor");
  return (
    <div>
      <textarea
        aria-label={t("tabs.diff")}
        style={s.mono}
        spellCheck={false}
        value={value}
        placeholder={t("diffPlaceholder")}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
      />
      {error && <div style={s.error}>{error}</div>}
    </div>
  );
}
