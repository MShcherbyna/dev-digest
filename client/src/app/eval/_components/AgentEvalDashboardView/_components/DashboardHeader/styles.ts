import type { CSSProperties } from "react";

export const s = {
  back: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    fontWeight: 500,
    color: "var(--text-secondary)",
    textDecoration: "none",
    marginBottom: 18,
  } satisfies CSSProperties,
  row: { display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" } satisfies CSSProperties,
  text: { flex: 1, minWidth: 240 } satisfies CSSProperties,
  nameRow: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 } satisfies CSSProperties,
  name: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  model: {
    fontSize: 12.5,
    padding: "3px 9px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    background: "var(--bg-elevated)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", margin: "8px 0 0" } satisfies CSSProperties,
  controls: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
};
