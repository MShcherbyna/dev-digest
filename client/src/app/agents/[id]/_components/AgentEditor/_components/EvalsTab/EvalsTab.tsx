/* EvalsTab — placeholder until agent evals ship. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

export function EvalsTab() {
  const t = useTranslations("agents");
  return <EmptyState icon="FlaskConical" title={t("evals.title")} body={t("evals.body")} />;
}
