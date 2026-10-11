import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingTour } from "@/lib/hooks/onboarding";
import { s as shared } from "../../styles";
import { s } from "./styles";

export function ReadingPathList({ items }: { items: OnboardingTour["reading_path"] }) {
  const t = useTranslations("onboarding");
  if (items.length === 0) return <div style={shared.muted}>{t("emptyIndex")}</div>;
  return (
    <ol style={s.list}>
      {items.map((item, i) => (
        <li key={`${item.path}-${i}`} style={s.item}>
          <span style={s.badge}>{i + 1}</span>
          <div style={s.text}>
            <div className="mono" style={s.path} title={item.path}>
              {item.path}
            </div>
            <div style={s.reason} title={item.reason}>
              {item.reason}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
