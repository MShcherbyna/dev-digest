import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import type { OnboardingTour } from "@/lib/hooks/onboarding";
import { s as shared } from "../../styles";
import { s } from "./styles";

export function CriticalPathList({
  items,
  fullName,
  commitSha,
}: {
  items: OnboardingTour["critical_paths"];
  fullName: string;
  commitSha: string;
}) {
  const t = useTranslations("onboarding");
  if (items.length === 0) return <div style={shared.muted}>{t("emptyIndex")}</div>;
  return (
    <div style={shared.stack}>
      {items.map((item, i) => (
        <div key={`${item.path}-${i}`} style={s.row}>
          <Icon.FileText size={15} style={s.icon} />
          <span style={s.text} title={`${item.path} — ${item.description}`}>
            <span className="mono" style={s.path}>{item.path}</span>
            <span style={s.desc}> — {item.description}</span>
          </span>
          <a
            href={githubBlobUrl(fullName, commitSha, item.path)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("openAria", { path: item.path })}
            style={s.open}
          >
            {t("open")}
          </a>
        </div>
      ))}
    </div>
  );
}
