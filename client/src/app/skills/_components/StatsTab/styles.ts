import type { CSSProperties } from "react";

/** Co-located styles for StatsTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 28, maxWidth: 820 } satisfies CSSProperties,
  tiles: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 } satisfies CSSProperties,
  tile: {
    padding: 16,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  tileLabel: { fontSize: 12, color: "var(--text-muted)", marginBottom: 8 } satisfies CSSProperties,
  tileValueRow: { display: "flex", alignItems: "center", justifyContent: "space-between" } satisfies CSSProperties,
  tileValue: { fontSize: 24, fontWeight: 700 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  agentList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  agentLink: { color: "var(--accent-text)", fontSize: 14, textDecoration: "none" } satisfies CSSProperties,
} as const;
