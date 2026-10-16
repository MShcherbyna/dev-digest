import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  status: { width: 22, display: "inline-grid", placeItems: "center", flexShrink: 0 } satisfies CSSProperties,
  dot: { width: 5, height: 5, borderRadius: 99, border: "1px solid var(--text-muted)" } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  name: {
    fontSize: 15,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  sub: { fontSize: 13.5, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  chip: {
    fontSize: 13,
    fontWeight: 500,
    padding: "4px 10px",
    borderRadius: 6,
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 2 } satisfies CSSProperties,
};
