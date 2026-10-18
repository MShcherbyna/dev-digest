/* CiRunRow — one CI run as a table row (AC-30). Every value comes from an untrusted
   artifact / GitHub response, so it is rendered as text; the job is a link only for
   https://github.com/ URLs. Unknown values show "—". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, SEV } from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared";
import { formatCost } from "@/lib/format";
import { STATUS_STYLE, VERDICT_STYLE } from "../../constants";
import { isGithubUrl } from "@/lib/github-urls";
import { DASH, findingEntries, formatDuration, formatTimestamp } from "../../helpers";
import { s } from "../../styles";

function Truncated({ text, style }: { text: string; style?: React.CSSProperties }) {
  return (
    <span title={text} style={{ ...s.ellipsis, ...style }}>
      {text}
    </span>
  );
}

export function CiRunRow({ run, divider }: { run: CiRun; divider: boolean }) {
  const t = useTranslations("ci.runs");
  const status = run.status ? STATUS_STYLE[run.status] : null;
  const verdict = run.verdict ? VERDICT_STYLE[run.verdict] : null;
  const findings = findingEntries(run);
  const agentName = run.agent ?? run.agent_slug;
  const sourceLabel = run.source === "ci" ? t("source.ci") : run.source;
  const jobLabel = run.pr_number != null ? t("viewJob", { pr: run.pr_number }) : t("viewJobNoPr");

  return (
    <div role="row" style={divider ? { ...s.row, borderBottom: "1px solid var(--border)" } : s.row}>
      <div role="cell" style={s.cell}>
        <span className="mono" style={s.mono}>
          {formatTimestamp(run.ran_at)}
        </span>
      </div>
      <div role="cell" style={s.cell}>
        {run.repo ? <Truncated text={run.repo} style={s.repo} /> : <span style={s.muted}>{DASH}</span>}
      </div>
      <div role="cell" style={{ ...s.cell, display: "flex", alignItems: "baseline", minWidth: 0 }}>
        {run.pr_number != null ? (
          <>
            <span className="mono" style={s.prNumber}>
              #{run.pr_number}
            </span>
            {run.pr_title && <Truncated text={run.pr_title} />}
          </>
        ) : (
          <span style={s.muted}>{DASH}</span>
        )}
      </div>
      <div role="cell" style={s.cell}>
        <span style={s.agent}>
          <Icon.Cpu size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <Truncated text={agentName} />
        </span>
      </div>
      <div role="cell" style={s.cell}>
        {sourceLabel ? (
          <Badge color="var(--text-secondary)" icon="Workflow">
            {sourceLabel}
          </Badge>
        ) : (
          <span style={s.muted}>{DASH}</span>
        )}
      </div>
      <div role="cell" className="tnum" style={{ ...s.cell, fontSize: 12 }}>
        {formatDuration(run)}
      </div>
      <div role="cell" style={s.cell}>
        {findings.length === 0 ? (
          <span style={s.muted}>{DASH}</span>
        ) : (
          <div style={s.findings}>
            {findings.map(({ field, sev, count }) => {
              const Ico = Icon[SEV[sev].icon];
              const label = t(`severity.${field}`, { count });
              return (
                <span key={field} title={label} aria-label={label} style={{ ...s.finding, color: SEV[sev].c }}>
                  <Ico size={12} />
                  <span className="tnum">{count}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div role="cell" style={s.cell}>
        {run.verdict && verdict ? (
          <Badge color={verdict.color} bg={verdict.bg}>
            {t(`verdict.${run.verdict}`)}
          </Badge>
        ) : (
          <span style={s.muted}>{DASH}</span>
        )}
      </div>
      <div role="cell" className="mono tnum" style={{ ...s.cell, ...s.cost }}>
        {formatCost(run.cost_usd)}
      </div>
      <div role="cell" style={s.cell}>
        {status ? (
          <Badge color={status.color} bg={status.bg} dot>
            {t(`status.${status.key}`)}
          </Badge>
        ) : (
          <span style={s.muted}>{DASH}</span>
        )}
      </div>
      <div role="cell" style={s.cell}>
        {isGithubUrl(run.job_url) ? (
          <a
            className="mono"
            href={run.job_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={jobLabel}
            style={s.jobLink}
          >
            {t("view")}
          </a>
        ) : run.job_url ? (
          <Truncated text={run.job_url} style={s.muted} />
        ) : (
          <span style={s.muted}>{DASH}</span>
        )}
      </div>
    </div>
  );
}
