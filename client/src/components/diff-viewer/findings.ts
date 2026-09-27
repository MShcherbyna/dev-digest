/* Inline-findings support for the DiffViewer (Files changed tab), modelled on
   comments.ts. Feature-agnostic: the caller injects how a finding renders via
   `renderFinding`, so this module never imports from `src/app/**`. */
import type React from "react";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { lineKey } from "./comments";
import { SEVERITY_RANK } from "./constants";

/** What the viewer needs to read + render inline findings. */
export interface DiffFindingsApi {
  /** Server `finding_lines` per file path — drives the file-card dot. */
  linesByPath: ReadonlyMap<string, readonly number[]>;
  /** Latest-review finding records per file path — drives the inline cards. */
  byPath: ReadonlyMap<string, FindingRecord[]>;
  /** Renders one finding. Must return a stable component type (e.g. always
   *  `<FindingCard .../>`) so no component identity is created per render. */
  renderFinding: (f: FindingRecord) => React.ReactNode;
}

/**
 * Splits a file's findings into those anchored to a rendered line (keyed by
 * `RIGHT:startLine` — grounding uses new-file line numbers, so only RIGHT is
 * used) and "unanchored" ones whose line is no longer in the patch.
 */
export function partitionFindings(
  findings: FindingRecord[],
  renderedKeys: Set<string>,
): { matched: Map<string, FindingRecord[]>; unanchored: FindingRecord[] } {
  const matched = new Map<string, FindingRecord[]>();
  const unanchored: FindingRecord[] = [];
  for (const f of findings) {
    const key = lineKey("RIGHT", f.start_line);
    if (key && renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(f);
      matched.set(key, list);
    } else {
      unanchored.push(f);
    }
  }
  return { matched, unanchored };
}

/** The highest-ranked severity among a list of findings (list must be non-empty). */
export function worstSeverity(findings: FindingRecord[]): Severity {
  let worst: Severity = findings[0]!.severity;
  for (const f of findings) {
    if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[worst]) worst = f.severity;
  }
  return worst;
}
