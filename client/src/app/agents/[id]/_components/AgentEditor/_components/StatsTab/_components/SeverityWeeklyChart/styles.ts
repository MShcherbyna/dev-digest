import type { CSSProperties } from "react";

/** Co-located styles for SeverityWeeklyChart. */
export const s = {
  legend: { listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", gap: 16, justifyContent: "center" } satisfies CSSProperties,
  legendItem: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  swatch: (color: string): CSSProperties => ({ width: 9, height: 9, borderRadius: 2, background: color }),
} as const;
