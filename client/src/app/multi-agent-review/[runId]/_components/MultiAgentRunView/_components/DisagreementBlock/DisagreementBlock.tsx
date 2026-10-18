/* DisagreementBlock — "Where agents disagree" (S4/S5 bottom). One card per
   flagged location; "Show only conflicts" filters to locations where the
   verdicts actually diverge (AC-25). The toggle's state is lifted into the
   parent so it survives a Columns/Tabs mode switch (AC-30). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, Icon, Toggle } from "@devdigest/ui";
import { SEV } from "@devdigest/ui";
import type { AgentColumnView, Conflict } from "@/lib/types";
import { cellFor, isConflict } from "../../helpers";
import { s } from "./styles";

function cellColor(kind: string, verdict?: string) {
  if (kind === "flagged" && verdict && verdict !== "ignored") {
    return (SEV as Record<string, { c: string }>)[verdict]?.c ?? "var(--text-muted)";
  }
  return "var(--text-muted)";
}

export function DisagreementBlock({
  conflicts,
  columns,
  onlyConflicts,
  onToggleOnlyConflicts,
}: {
  conflicts: Conflict[];
  columns: AgentColumnView[];
  onlyConflicts: boolean;
  onToggleOnlyConflicts: (v: boolean) => void;
}) {
  const t = useTranslations("runs");
  const anyVerdict = conflicts.some((c) => c.takes.some((take) => take.verdict !== "ignored"));
  const shown = onlyConflicts ? conflicts.filter(isConflict) : conflicts;

  return (
    <div style={s.wrap}>
      <div style={s.headRow}>
        <span style={s.heading}>
          <Icon.Activity size={13} />
          {t("conflicts.title")}
        </span>
        <label style={s.toggleRow}>
          <span style={s.toggleLabel}>{t("conflicts.onlyConflicts")}</span>
          <Toggle on={onlyConflicts} onChange={onToggleOnlyConflicts} size={16} />
        </label>
      </div>

      {!anyVerdict ? (
        <EmptyState icon="Users" title={t("conflicts.noVerdictTitle")} body={t("conflicts.noVerdictYet")} />
      ) : shown.length === 0 ? (
        <EmptyState icon="Users" title={t("conflicts.emptyTitle")} body={t("conflicts.empty")} />
      ) : (
        shown.map((conflict, i) => (
          <div key={`${conflict.file}:${conflict.line}:${i}`} style={s.card}>
            <div style={s.cardHead}>
              <div style={s.cardTitle}>{conflict.title}</div>
              <div style={s.cardPath} title={`${conflict.file}:${conflict.line}`}>
                <Icon.Code size={13} style={{ flexShrink: 0 }} />
                <span className="mono" style={s.cardPathText}>
                  {conflict.file}:{conflict.line}
                </span>
              </div>
            </div>
            <div style={s.cellsRow}>
              {columns.map((col, idx) => {
                const take = conflict.takes.find((tk) => tk.agent_id === col.agent_id);
                const cell = cellFor(col, take);
                const nonFlaggedKey: Record<string, string> = {
                  did_not_flag: "didNotFlag",
                  failed: "failedNoVerdict",
                  cancelled: "cancelled",
                  queued: "queued",
                  running: "running",
                };
                const verdictLabel =
                  cell.kind === "flagged"
                    ? (cell.verdict && SEV[cell.verdict as keyof typeof SEV]?.label) || cell.verdict
                    : t(`conflicts.${nonFlaggedKey[cell.kind]}` as const);
                return (
                  <div key={col.run_id} style={idx === columns.length - 1 ? s.cellLast : s.cell}>
                    <div style={s.cellAgent}>{col.agent_name}</div>
                    <div style={s.cellVerdict(cellColor(cell.kind, cell.verdict))}>
                      <span style={{ width: 6, height: 6, borderRadius: 99, background: cellColor(cell.kind, cell.verdict) }} />
                      {verdictLabel}
                    </div>
                    {cell.kind === "flagged" && cell.note && <div style={s.cellNote}>{cell.note}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
