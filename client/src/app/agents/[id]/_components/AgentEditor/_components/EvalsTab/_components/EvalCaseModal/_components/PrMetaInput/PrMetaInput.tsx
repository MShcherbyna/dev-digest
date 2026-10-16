/* PrMetaInput — the simulated PR title and description. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, Textarea } from "@devdigest/ui";

export function PrMetaInput({
  title,
  body,
  onTitle,
  onBody,
}: {
  title: string;
  body: string;
  onTitle: (v: string) => void;
  onBody: (v: string) => void;
}) {
  const t = useTranslations("eval.caseEditor");
  return (
    <div style={{ paddingTop: 16 }}>
      <FormField label={t("titleLabel")}>
        <TextInput value={title} onChange={onTitle} placeholder={t("titlePlaceholder")} maxLength={500} />
      </FormField>
      <FormField label={t("bodyLabel")}>
        <Textarea value={body} onChange={onBody} placeholder={t("bodyPlaceholder")} rows={6} />
      </FormField>
    </div>
  );
}
