import type { CSSProperties } from "react";

/** Co-located styles for EvalsTab (screenshot 6). */
export const s = {
  wrap: { padding: "24px 32px", display: "flex", flexDirection: "column", gap: 24 } satisfies CSSProperties,
  metricsHead: { display: "flex", alignItems: "center", justifyContent: "space-between" } satisfies CSSProperties,
  dashLink: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  casesHead: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  casesTitle: { margin: 0, fontSize: 20, fontWeight: 600 } satisfies CSSProperties,
  badge: {
    fontSize: 13,
    fontWeight: 500,
    padding: "3px 10px",
    borderRadius: 6,
    color: "var(--ok)",
    background: "var(--ok-bg)",
  } satisfies CSSProperties,
  headActions: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10, minHeight: 0, overflowY: "auto" } satisfies CSSProperties,
  runNote: { fontSize: 12.5, color: "var(--crit)" } satisfies CSSProperties,
};
