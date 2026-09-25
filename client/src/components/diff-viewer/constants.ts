/** Constants for the DiffViewer. */
import type { Severity } from "@devdigest/shared";

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Severity ranking for picking the "worst" of several findings on one line. */
export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
};

/** Severities that have a `diffViewer.findingLabel.<SEVERITY>` i18n key.
 *  (`FindingRecord.severity` on the client has no INFO variant.) */
export const LABELED_SEVERITIES: readonly Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];
