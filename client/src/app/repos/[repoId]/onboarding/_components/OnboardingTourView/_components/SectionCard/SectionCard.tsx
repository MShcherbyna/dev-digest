"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { SECTION_ICONS, type SectionKey } from "../../constants";
import { sectionDomId } from "../../helpers";
import { s } from "./styles";

export function SectionCard({
  sectionKey,
  collapsed,
  onToggle,
  children,
}: {
  sectionKey: SectionKey;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("onboarding");
  const title = t(`sections.${sectionKey}`);
  const I = Icon[SECTION_ICONS[sectionKey]];
  const domId = sectionDomId(sectionKey);
  const bodyId = `${domId}-body`;
  return (
    <section id={domId} aria-labelledby={`${domId}-title`} style={s.card}>
      <div style={s.head}>
        <div style={s.tile} aria-hidden>
          <I size={16} />
        </div>
        <h2 id={`${domId}-title`} style={s.title}>
          {title}
        </h2>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          aria-label={t(collapsed ? "expandAria" : "collapseAria", { section: title })}
          onClick={onToggle}
          style={s.chevron}
        >
          <Icon.ChevronDown size={16} style={{ transform: collapsed ? undefined : "rotate(180deg)" }} />
        </button>
      </div>
      {!collapsed && (
        <div id={bodyId} style={s.body}>
          {children}
        </div>
      )}
    </section>
  );
}
