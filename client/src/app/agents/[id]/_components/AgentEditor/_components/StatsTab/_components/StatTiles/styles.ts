import type { CSSProperties } from "react";

/** Co-located styles for StatTiles. */
export const s = {
  tiles: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 } satisfies CSSProperties,
  tile: {
    padding: 16,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  tileHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 36,
    marginBottom: 10,
  } satisfies CSSProperties,
  tileLabel: {
    fontSize: 11,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  tileValueRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 40 } satisfies CSSProperties,
  tileValue: { fontSize: 26, fontWeight: 700 } satisfies CSSProperties,
  /** Red + when cost went up, green when it went down. */
  delta: (up: boolean): CSSProperties => ({
    marginRight: "auto",
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 6px",
    borderRadius: 4,
    color: up ? "var(--crit)" : "var(--ok)",
    background: up ? "var(--crit-bg)" : "var(--ok-bg)",
  }),
} as const;
