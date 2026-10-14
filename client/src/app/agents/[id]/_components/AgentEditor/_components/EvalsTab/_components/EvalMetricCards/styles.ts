import type { CSSProperties } from "react";

export const s = {
  grid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 } satisfies CSSProperties,
  card: {
    padding: "18px 20px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  label: { fontSize: 12, fontWeight: 600, letterSpacing: "0.07em", color: "var(--text-muted)" } satisfies CSSProperties,
  valueRow: { display: "flex", alignItems: "baseline", gap: 8, marginTop: 10 } satisfies CSSProperties,
  value: (color: string): CSSProperties => ({ fontSize: 30, fontWeight: 600, color }),
  delta: (up: boolean): CSSProperties => ({ fontSize: 13, fontWeight: 500, color: up ? "var(--ok)" : "var(--crit)" }),
  hint: { fontSize: 13, color: "var(--text-muted)", marginTop: 12 } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
};
