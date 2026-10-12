import type { CSSProperties } from "react";

export const s = {
  label: { fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 10 } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  item: {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "8px 10px",
    background: "transparent",
    border: "none",
    borderLeft: "2px solid var(--border)",
    fontSize: 13,
    color: "var(--text-secondary)",
    cursor: "pointer",
  } satisfies CSSProperties,
  itemActive: { borderLeftColor: "var(--accent)", color: "var(--text-primary)", fontWeight: 500 } satisfies CSSProperties,
};
