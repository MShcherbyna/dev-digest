/* FindingsSummary — the PR list's Findings-column severity counter. Hover OR
   click opens a short preview popover of the latest review's findings;
   clicking a finding (or a severity chip in the footer) navigates to the PR
   detail page with that severity pre-filtered in Review Runs. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { SeverityBadge, ConfidenceNum, SEV, type Severity } from "@devdigest/ui";
import type { PrMeta } from "@/lib/types";
import { usePrReviews } from "@/lib/hooks/reviews";
import { ORDERED_SEVERITIES, POPOVER_MAX_ITEMS } from "./constants";
import { toSeverityCounts, latestReviewFindings } from "./helpers";
import { s } from "./styles";

function lineLabel(start: number, end: number): string {
  return start === end ? `${start}` : `${start}-${end}`;
}

export function FindingsSummary({ pr, repoId }: { pr: PrMeta; repoId: string }) {
  const router = useRouter();
  const [hovering, setHovering] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const open = hovering || pinned;
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!pinned) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPinned(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinned(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pinned]);

  const { data: reviews } = usePrReviews(open ? pr.id : null);
  const findings = latestReviewFindings(reviews);

  if (!pr.findings) return <span style={s.muted}>—</span>;
  const counts = toSeverityCounts(pr.findings);
  const present = ORDERED_SEVERITIES.filter((sev) => counts[sev] > 0);
  const total = present.reduce((n, sev) => n + counts[sev], 0);
  if (present.length === 0) return <span style={s.muted}>0 findings</span>;

  const goTo = (severity: Severity) => {
    setPinned(false);
    router.push(`/repos/${repoId}/pulls/${pr.number}?tab=findings&severity=${severity}`);
  };

  return (
    <div
      ref={ref}
      style={s.wrap}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Findings by severity"
        onClick={(e) => {
          e.stopPropagation();
          setPinned((p) => !p);
        }}
        style={s.trigger}
      >
        {present.map((sev, i) => (
          <React.Fragment key={sev}>
            {i > 0 && <span style={s.sep}>·</span>}
            <span style={{ color: SEV[sev].c }}>
              {counts[sev]} {SEV[sev].label.toUpperCase()}
            </span>
          </React.Fragment>
        ))}
      </button>

      {open && (
        <div role="dialog" aria-label="Findings preview" style={s.popover} onClick={(e) => e.stopPropagation()}>
          <div style={s.popoverHeader}>
            {total} finding{total === 1 ? "" : "s"}
          </div>

          {findings.length === 0 ? (
            <div style={s.popoverEmpty}>Loading…</div>
          ) : (
            <div style={s.popoverList}>
              {findings.slice(0, POPOVER_MAX_ITEMS).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  style={s.popoverItem}
                  onClick={(e) => {
                    e.stopPropagation();
                    goTo(f.severity as Severity);
                  }}
                >
                  <SeverityBadge severity={f.severity as Severity} compact />
                  <div style={s.popoverItemMain}>
                    <div style={s.popoverItemTitle}>{f.title}</div>
                    <div style={s.popoverItemMeta}>
                      <span className="mono">
                        {f.file}:{lineLabel(f.start_line, f.end_line)}
                      </span>
                      <ConfidenceNum value={f.confidence} />
                    </div>
                  </div>
                </button>
              ))}
              {findings.length > POPOVER_MAX_ITEMS && (
                <div style={s.popoverMore}>+{findings.length - POPOVER_MAX_ITEMS} more</div>
              )}
            </div>
          )}

          <div style={s.popoverFooterRow}>
            {present.map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goTo(sev);
                }}
                style={s.popoverFooterChip}
              >
                <SeverityBadge severity={sev} count={counts[sev]} compact />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
