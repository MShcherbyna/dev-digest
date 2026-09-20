import type { CSSProperties } from "react";

/** Co-located styles for UsageBars. */
export const s = {
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  row: (dim?: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr) 40px",
    alignItems: "center",
    gap: 12,
    opacity: dim ? 0.45 : 1,
  }),
  label: {
    fontSize: 13,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  track: { height: 6, borderRadius: 3, background: "var(--bg-hover)", overflow: "hidden", display: "block" } satisfies CSSProperties,
  fill: (pct: number, color: string): CSSProperties => ({
    display: "block",
    height: "100%",
    width: `${pct}%`,
    borderRadius: 3,
    background: color,
  }),
  pct: { fontSize: 12, textAlign: "right", color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
