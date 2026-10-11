"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { useToast } from "@/lib/toast";
import { copyToClipboard, formatCount, relativeTime } from "../../helpers";
import type { OnboardingTour } from "@/lib/hooks/onboarding";
import { s } from "./styles";

export function TourHeader({
  repoId,
  repoName,
  tour,
  cloned,
  generating,
  onRegenerate,
}: {
  repoId: string;
  repoName: string;
  tour: OnboardingTour;
  cloned: boolean;
  generating: boolean;
  onRegenerate: () => void;
}) {
  const t = useTranslations("onboarding");
  const toast = useToast();

  async function share() {
    const url = `${window.location.origin}/repos/${repoId}/onboarding`;
    if (await copyToClipboard(url)) toast.success(t("linkCopied"));
    else toast.error(t("copyFailed"));
  }

  return (
    <div style={s.row}>
      <div style={s.titleBlock}>
        <h1 style={s.title}>
          {t("header.prefix")} <span className="mono" style={s.repo}>{repoName}</span>
        </h1>
        <div style={s.subtitle}>
          {t("header.subtitle", {
            count: formatCount(tour.files_indexed),
            time: relativeTime(tour.generated_at),
          })}
        </div>
      </div>
      <div style={s.actions}>
        <Button kind="secondary" icon="RefreshCw" onClick={onRegenerate} disabled={generating || !cloned}>
          {generating ? t("regenerating") : t("regenerate")}
        </Button>
        <Button kind="secondary" icon="Link" onClick={() => void share()}>
          {t("shareLink")}
        </Button>
      </div>
    </div>
  );
}
