import type { CSSProperties } from "react";

/** Co-located styles for FindingsSummary's own dash/zero-findings states —
 *  the popover itself is styled in SeverityFindingsBreakdown/styles.ts. */
export const s = {
  muted: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
} as const;
