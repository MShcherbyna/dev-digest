/* PrMetaInput — the simulated PR title and description. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, Textarea } from "@devdigest/ui";

/** `Textarea` (`@devdigest/ui`, vendored) has no `readOnly`, so the body falls back to a static block. */
const readOnlyBody: React.CSSProperties = {
  width: "100%",
  minHeight: 120,
  padding: "10px 12px",
  borderRadius: 7,
  border: "1px solid var(--border-strong)",
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  fontSize: 14,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
};

export function PrMetaInput({
  title,
  body,
  onTitle,
  onBody,
  readOnly,
}: {
  title: string;
  body: string;
  onTitle: (v: string) => void;
  onBody: (v: string) => void;
  readOnly?: boolean;
}) {
  const t = useTranslations("eval.caseEditor");
  return (
    <div style={{ paddingTop: 16 }}>
      <FormField label={t("titleLabel")}>
        <TextInput value={title} onChange={onTitle} placeholder={t("titlePlaceholder")} maxLength={500} readOnly={readOnly} />
      </FormField>
      <FormField label={t("bodyLabel")}>
        {readOnly ? <div style={readOnlyBody}>{body}</div> : <Textarea value={body} onChange={onBody} placeholder={t("bodyPlaceholder")} rows={6} />}
      </FormField>
    </div>
  );
}
