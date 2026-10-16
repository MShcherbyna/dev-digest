import type { CSSProperties } from "react";

export const s = {
  head: { display: "flex", alignItems: "center", justifyContent: "space-between" } satisfies CSSProperties,
  legend: { display: "flex", gap: 18, fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  swatch: (color: string): CSSProperties => ({ width: 12, height: 2, background: color, display: "inline-block" }),
  plot: { height: 280 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "40px 0", textAlign: "center" } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
};
