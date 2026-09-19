import type { CSSProperties } from "react";

/** Co-located styles for CategoryDonut. */
export const s = {
  donutRow: { display: "flex", alignItems: "center", gap: 24 } satisfies CSSProperties,
  legend: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  legendRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 13 } satisfies CSSProperties,
  legendLabel: { color: "var(--text-secondary)", minWidth: 90 } satisfies CSSProperties,
  legendValue: { fontWeight: 600 } satisfies CSSProperties,
  swatch: (color: string): CSSProperties => ({ width: 9, height: 9, borderRadius: 2, background: color }),
} as const;
