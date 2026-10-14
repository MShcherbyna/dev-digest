/* EvalCaseRow — one eval case: status icon, name, "expected N, got M", label chip, Run/Edit/Delete. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, IconBtn } from "@devdigest/ui";
import type { EvalCaseSummary } from "@/lib/hooks/eval";
import { rowLabel, rowStatus, type RowStatus } from "../../helpers";
import { s } from "./styles";

function StatusIcon({ status }: { status: RowStatus }) {
  if (status === "passed") return <Icon.CheckCircle size={20} style={{ color: "var(--ok)" }} />;
  if (status === "failed") return <Icon.XCircle size={20} style={{ color: "var(--crit)" }} />;
  if (status === "error") return <Icon.AlertTriangle size={20} style={{ color: "var(--warn)" }} />;
  if (status === "running")
    return <Icon.RefreshCw size={18} style={{ color: "var(--accent)", animation: "ddspin 1s linear infinite" }} />;
  return <span style={s.dot} />;
}

export function EvalCaseRow({
  c,
  onRun,
  onEdit,
  onDelete,
}: {
  c: EvalCaseSummary;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("eval.evalsTab");
  const status = rowStatus(c);
  const r = c.latest_result;
  const label = rowLabel(c.expected_output);

  let sub: string;
  if (status === "running") sub = t("running");
  else if (status === "never" || !r) sub = t("neverRun");
  else if (status === "error")
    sub = t("caseError", {
      reason: r.error_reason && t.has(`reasons.${r.error_reason}`) ? t(`reasons.${r.error_reason}`) : (r.error_reason ?? "—"),
    });
  else sub = t("expectedGot", { expected: r.expected_count ?? 0, got: r.got_count ?? 0 });

  return (
    <div style={s.row} data-status={status}>
      <span
        style={s.status}
        role="img"
        aria-label={status === "never" ? t("neverRun") : status === "error" ? t("statusError") : t(status)}
      >
        <StatusIcon status={status} />
      </span>
      <div style={s.main}>
        <div style={s.name} className="mono" title={c.name}>
          {c.name}
        </div>
        <div style={s.sub}>{sub}</div>
      </div>
      {c.origin === "manual" && <span style={s.chip}>{t("manual")}</span>}
      {label && (
        <span style={s.chip} className={label.kind === "expectation" ? undefined : "mono"}>
          {label.kind === "expectation" ? label.text : label.kind === "mustNotFlag" ? t("mustNotFlag") : t("emptyArray")}
        </span>
      )}
      <div style={s.actions}>
        <IconBtn icon="Play" label={t("runCaseAria", { name: c.name })} onClick={onRun} />
        <IconBtn icon="Edit" label={t("editCaseAria", { name: c.name })} onClick={onEdit} />
        <IconBtn icon="Trash" label={t("deleteCaseAria", { name: c.name })} onClick={onDelete} danger />
      </div>
    </div>
  );
}
