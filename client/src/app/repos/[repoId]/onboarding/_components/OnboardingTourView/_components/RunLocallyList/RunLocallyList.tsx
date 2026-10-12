"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { useToast } from "@/lib/toast";
import type { OnboardingTour } from "@/lib/hooks/onboarding";
import { copyToClipboard } from "../../helpers";
import { s as shared } from "../../styles";
import { s } from "./styles";

export function RunLocallyList({ items }: { items: OnboardingTour["run_locally"] }) {
  const t = useTranslations("onboarding");
  const toast = useToast();
  if (items.length === 0) return <div style={shared.muted}>{t("emptyCommands")}</div>;

  async function copy(command: string) {
    if (await copyToClipboard(command)) toast.success(t("copied"));
    else toast.error(t("copyFailed"));
  }

  return (
    <div style={shared.stack}>
      {items.map((item, i) => (
        <div key={`${item.command}-${i}`} style={s.row}>
          <span style={s.index}>{i + 1}</span>
          <span className="mono" style={s.command} title={item.command}>
            {item.command}
          </span>
          <button
            type="button"
            aria-label={t("copyAria", { command: item.command })}
            onClick={() => void copy(item.command)}
            style={s.copy}
          >
            <Icon.Copy size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
