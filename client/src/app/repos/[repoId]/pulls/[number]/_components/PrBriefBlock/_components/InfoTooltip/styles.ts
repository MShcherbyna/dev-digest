import type { CSSProperties } from "react";

export const s = {
  wrap: { position: "relative", display: "inline-flex", alignItems: "center" } satisfies CSSProperties,
  button: {
    display: "inline-grid",
    placeItems: "center",
    padding: 2,
    background: "none",
    border: "none",
    borderRadius: 4,
    color: "var(--text-muted)",
    cursor: "default",
  } satisfies CSSProperties,
  tip: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    zIndex: 20,
    whiteSpace: "nowrap",
    padding: "5px 9px",
    fontSize: 12,
    color: "var(--text-primary)",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    boxShadow: "0 4px 14px rgba(0,0,0,.35)",
  } satisfies CSSProperties,
} as const;
