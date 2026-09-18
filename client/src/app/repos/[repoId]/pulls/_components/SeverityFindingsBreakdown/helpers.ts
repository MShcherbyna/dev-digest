import type { Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { ORDERED_SEVERITIES } from "./constants";

/** Tally a findings array by severity into a full Severity → count map. */
export function countBySeverity(findings: FindingRecord[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0, INFO: 0 };
  for (const f of findings) {
    const sev = f.severity as Severity;
    if (sev in counts) counts[sev] += 1;
  }
  return counts;
}

/** Severities with at least one finding, in display order. */
export function presentSeverities(counts: Record<Severity, number>): Severity[] {
  return ORDERED_SEVERITIES.filter((sev) => counts[sev] > 0);
}

export function lineLabel(start: number, end: number): string {
  return start === end ? `${start}` : `${start}-${end}`;
}

const DESC_MAX = 100;
export function truncate(text: string, max: number = DESC_MAX): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}
