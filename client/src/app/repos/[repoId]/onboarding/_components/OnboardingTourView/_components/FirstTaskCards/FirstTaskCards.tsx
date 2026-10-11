import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingTour } from "@/lib/hooks/onboarding";
import { s as shared } from "../../styles";
import { COMPLEXITY_COLOR } from "./constants";
import { s } from "./styles";

/** Complexity is carried by the pill text; the colour only reinforces it. */
export function FirstTaskCards({ items }: { items: OnboardingTour["first_tasks"] }) {
  const t = useTranslations("onboarding");
  if (items.length === 0) return <div style={shared.muted}>{t("emptyIndex")}</div>;
  return (
    <div style={s.grid}>
      {items.map((item, i) => {
        const color = COMPLEXITY_COLOR[item.complexity];
        return (
          <div key={`${item.path}-${i}`} style={s.card}>
            <div style={s.title} title={item.title}>{item.title}</div>
            <div className="mono" style={s.path} title={item.path}>
              {item.path}
            </div>
            <span style={{ ...s.pill, color, borderColor: color }}>{t(`complexity.${item.complexity}`)}</span>
          </div>
        );
      })}
    </div>
  );
}
