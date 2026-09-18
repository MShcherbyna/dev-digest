/* SeverityFindingsBreakdown — a severity counter ("N CRITICAL · N WARNING")
   whose hover OR click opens "N FINDINGS IN THIS RUN": a short, read-only
   preview (severity icon, title, category, file:line, confidence, a short
   description — no buttons/links). The list scrolls internally once it
   outgrows the popover's max height, so the trigger's position stays put
   regardless of how many findings there are. Shared between the PR list's
   Findings column and the PR detail page's Agent-runs Timeline, which differ
   only in how they source `counts`/`findings` (server-precomputed +
   lazy-fetched vs. already-loaded from `usePrReviews`). */
"use client";

import React from "react";
import { Icon, SeverityBadge, CategoryTag, ConfidenceNum, SEV, type Severity, type Category } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { presentSeverities, lineLabel, truncate } from "./helpers";
import { s } from "./styles";

export function SeverityFindingsBreakdown({
  counts,
  findings,
  onOpenChange,
}: {
  counts: Record<Severity, number>;
  /** undefined while findings haven't been fetched yet (popover shows "Loading…"). */
  findings: FindingRecord[] | undefined;
  /** Notified whenever the popover opens/closes — lets a lazy-loading caller
   *  (e.g. the PR list) fetch findings only once the popover is actually open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [hovering, setHovering] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const open = hovering || pinned;
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    onOpenChange?.(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  const present = presentSeverities(counts);
  const total = present.reduce((n, sev) => n + counts[sev], 0);
  if (present.length === 0) return null;

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
        {present.map((sev, i) => {
          const SevIcon = Icon[SEV[sev].icon];
          return (
            <React.Fragment key={sev}>
              {i > 0 && <span style={s.sep}>·</span>}
              <SevIcon size={12} style={{ color: SEV[sev].c }} />
              <span style={{ color: SEV[sev].c }}>{counts[sev]}</span>
            </React.Fragment>
          );
        })}
      </button>

      {open && (
        <div role="dialog" aria-label="Findings preview" style={s.popover} onClick={(e) => e.stopPropagation()}>
          <div style={s.popoverHeader}>
            {total} FINDING{total === 1 ? "" : "S"} IN THIS RUN
          </div>

          {findings == null || findings.length === 0 ? (
            <div style={s.popoverEmpty}>{findings == null ? "Loading…" : "No findings"}</div>
          ) : (
            <div style={s.popoverList}>
              {findings.map((f) => (
                <div key={f.id} style={s.popoverItem}>
                  <SeverityBadge severity={f.severity as Severity} compact />
                  <div style={s.popoverItemMain}>
                    <div style={s.popoverItemTitleRow}>
                      <span style={s.popoverItemTitle}>{f.title}</span>
                      <CategoryTag category={f.category as Category} />
                    </div>
                    <div style={s.popoverItemMeta}>
                      <span className="mono" style={s.popoverItemPath}>
                        {f.file}:{lineLabel(f.start_line, f.end_line)}
                      </span>
                      <ConfidenceNum value={f.confidence} />
                    </div>
                    <div style={s.popoverItemDesc}>{truncate(f.rationale)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
