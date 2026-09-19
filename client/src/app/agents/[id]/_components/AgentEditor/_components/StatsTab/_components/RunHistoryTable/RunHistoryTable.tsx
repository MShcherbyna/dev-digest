/* RunHistoryTable — the agent's recent runs; "View trace" opens the existing
   RunTraceDrawer in place (it only needs a runId + onClose). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { AgentUsageStats } from "@devdigest/shared";
import { RunTraceDrawer } from "@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer";
import { formatCost, formatTimestamp, formatTokens } from "../../helpers";
import { COLUMNS, SOURCE_COLOR } from "./constants";
import { s } from "./styles";

type RecentRun = AgentUsageStats["recent_runs"][number];

export interface RunHistoryTableProps {
  runs: readonly RecentRun[];
  /** Shown in the trace drawer title. */
  agentName?: string | null;
}

export function RunHistoryTable({ runs, agentName }: RunHistoryTableProps) {
  const t = useTranslations("agents");
  const [traceRun, setTraceRun] = React.useState<RecentRun | null>(null);

  if (runs.length === 0) return <div style={s.empty}>{t("stats.noRuns")}</div>;

  return (
    <>
      <table style={s.table}>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.key} scope="col" style={s.th(c.align)}>
                {c.key === "actions" ? <span style={s.srOnly}>{t("stats.columns.actions")}</span> : t(`stats.columns.${c.key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.run_id}>
              <td className="mono tnum" style={s.td()}>
                {formatTimestamp(r.ran_at)}
              </td>
              <td className="mono" style={s.td()}>
                {r.pr_number != null && r.repo_id != null ? (
                  <Link href={`/repos/${r.repo_id}/pulls/${r.pr_number}`} style={s.prLink}>
                    #{r.pr_number}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className="mono tnum" style={s.td("right")}>
                {formatTokens(r.tokens)}
              </td>
              <td className="mono tnum" style={s.td("right")}>
                {formatCost(r.cost_usd)}
              </td>
              <td className="mono tnum" style={s.td("right")}>
                {r.findings}
              </td>
              <td style={s.td()}>
                <Badge color={SOURCE_COLOR[r.source].color} bg={SOURCE_COLOR[r.source].bg}>
                  {t(`stats.source.${r.source}`)}
                </Badge>
              </td>
              <td style={s.td("right")}>
                <button type="button" style={s.traceBtn} onClick={() => setTraceRun(r)}>
                  {t("stats.viewTrace")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {traceRun && (
        <RunTraceDrawer
          runId={traceRun.run_id}
          agentName={agentName}
          prNumber={traceRun.pr_number}
          onClose={() => setTraceRun(null)}
        />
      )}
    </>
  );
}
