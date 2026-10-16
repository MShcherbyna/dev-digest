import type { CSSProperties } from "react";

export const s = {
  legend: { display: "flex", gap: 18, fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  swatch: (bg: string): CSSProperties => ({ width: 12, height: 12, borderRadius: 3, background: bg, border: "1px solid var(--border)", display: "inline-block" }),
  block: {
    maxHeight: "50vh",
    overflow: "auto",
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-base, var(--bg-surface))",
    fontSize: 13.5,
    lineHeight: 1.7,
  } satisfies CSSProperties,
  line: (type: "same" | "add" | "del"): CSSProperties => ({
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    minHeight: "1.7em",
    background: type === "add" ? "var(--ok-bg)" : type === "del" ? "var(--crit-bg, rgba(239,68,68,0.12))" : "transparent",
    textDecoration: type === "del" ? "line-through" : "none",
    color: type === "del" ? "var(--text-secondary)" : "var(--text-primary)",
  }),
  identical: { fontSize: 13.5, color: "var(--text-secondary)", padding: "6px 0" } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
};
