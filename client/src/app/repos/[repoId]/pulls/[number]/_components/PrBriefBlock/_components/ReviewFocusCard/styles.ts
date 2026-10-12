import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  empty: { fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.45 } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    width: "100%",
    padding: 0,
    background: "none",
    border: "none",
    textAlign: "left",
    cursor: "pointer",
    fontSize: 13.5,
  } satisfies CSSProperties,
  bullet: { flexShrink: 0, fontSize: 8, color: "var(--accent-text)" } satisfies CSSProperties,
  text: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  ref: { color: "var(--accent-text)" } satisfies CSSProperties,
  reason: { color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
