import type { CSSProperties } from "react";

export const s = {
  grid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 } satisfies CSSProperties,
  tile: { padding: "16px 18px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-surface)" } satisfies CSSProperties,
  label: { fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "var(--text-muted)" } satisfies CSSProperties,
  row: { display: "flex", alignItems: "baseline", gap: 8, marginTop: 12, flexWrap: "wrap" } satisfies CSSProperties,
  before: { fontSize: 18, color: "var(--text-muted)" } satisfies CSSProperties,
  after: (color: string): CSSProperties => ({ fontSize: 26, fontWeight: 700, color }),
  delta: (tone: "up" | "down" | "flat"): CSSProperties => ({
    fontSize: 13,
    fontWeight: 600,
    color: tone === "up" ? "var(--ok)" : tone === "down" ? "var(--crit)" : "var(--text-muted)",
  }),
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
};
