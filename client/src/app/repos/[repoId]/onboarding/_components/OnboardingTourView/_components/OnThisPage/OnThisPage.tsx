"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SECTION_KEYS, type SectionKey } from "../../constants";
import { s } from "./styles";

/** Buttons (not anchors): activation expands + scrolls to the section, no hash navigation. */
export function OnThisPage({ active, onSelect }: { active: SectionKey; onSelect: (key: SectionKey) => void }) {
  const t = useTranslations("onboarding");
  return (
    <nav aria-label={t("onThisPage")}>
      <div style={s.label}>{t("onThisPage")}</div>
      <ul style={s.list}>
        {SECTION_KEYS.map((key) => {
          const isActive = key === active;
          return (
            <li key={key}>
              <button
                type="button"
                aria-current={isActive ? "location" : undefined}
                onClick={() => onSelect(key)}
                style={{ ...s.item, ...(isActive ? s.itemActive : null) }}
              >
                {t(`sections.${key}`)}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
