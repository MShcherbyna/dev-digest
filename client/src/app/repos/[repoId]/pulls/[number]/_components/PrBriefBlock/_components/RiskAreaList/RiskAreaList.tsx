"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { SEVERITY_COLOR } from "../../constants";
import { kindLook } from "../../helpers";
import { s } from "./styles";

function RiskCard({ risk, onOpenRef }: { risk: Risk; onOpenRef: (ref: string) => void }) {
  const t = useTranslations("brief");
  const [open, setOpen] = React.useState(false);
  const bodyId = React.useId();
  const look = kindLook(risk.kind);
  const KindIcon = Icon[look.icon];
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
  return (
    <div style={s.card}>
      <div style={s.top}>
        <div style={s.main}>
          <div style={s.titleRow}>
            <KindIcon size={13} aria-hidden style={{ color: look.color, flexShrink: 0 }} />
            <span style={s.title}>{risk.title}</span>
          </div>
          {risk.file_refs.length > 0 && (
            <div style={s.refs}>
              {risk.file_refs.map((ref) => (
                <button
                  key={ref}
                  type="button"
                  className="mono"
                  title={ref}
                  style={s.ref}
                  onClick={() => onOpenRef(ref)}
                >
                  {ref}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          style={s.chevron}
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={t(open ? "panel.riskHide" : "panel.riskShow", { title: risk.title })}
          onClick={() => setOpen((o) => !o)}
        >
          <Chevron size={14} aria-hidden />
        </button>
      </div>
      {open && (
        <div id={bodyId} style={s.body}>
          <p style={s.explanation}>{risk.explanation}</p>
          <span style={s.severity(SEVERITY_COLOR[risk.severity])}>{t(`panel.severity.${risk.severity}`)}</span>
        </div>
      )}
    </div>
  );
}

/** The Intent card's RISK AREAS slot: one expandable card per brief risk (AC-13, AC-34, AC-38). */
export function RiskAreaList({ risks, onOpenRef }: { risks: Risk[]; onOpenRef: (ref: string) => void }) {
  const t = useTranslations("brief");
  if (risks.length === 0) return <div style={s.empty}>{t("noRisks")}</div>;
  return (
    <div style={s.list}>
      {risks.map((risk, i) => (
        <RiskCard key={`${i}:${risk.title}`} risk={risk} onOpenRef={onOpenRef} />
      ))}
    </div>
  );
}
