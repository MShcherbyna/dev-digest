/* ExpectedOutputEditor — JSON array of expectations with a live valid/invalid badge. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { s } from "../../styles";

export function ExpectedOutputEditor({
  value,
  onChange,
  onSkeleton,
  valid,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onSkeleton: () => void;
  valid: boolean;
  error?: string;
}) {
  const t = useTranslations("eval.caseEditor");
  return (
    <div>
      <div style={s.expHead}>
        <span style={s.expTitle}>{t("expectedOutput")}</span>
        <span style={s.badge(valid)}>
          {valid ? <Icon.Check size={12} aria-hidden /> : null}
          {valid ? t("validJson") : t("invalidJson")}
        </span>
        <Button kind="ghost" size="sm" icon="Plus" onClick={onSkeleton} style={s.skeletonBtn}>
          {t("findingSkeleton")}
        </Button>
      </div>
      <textarea
        aria-label={t("expectedOutput")}
        style={{ ...s.mono, minHeight: 280, marginTop: 12 }}
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <div style={s.error}>{error}</div>}
    </div>
  );
}
