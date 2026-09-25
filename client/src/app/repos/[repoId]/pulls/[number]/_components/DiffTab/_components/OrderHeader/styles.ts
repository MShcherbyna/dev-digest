import type { CSSProperties } from "react";

export const s = {
  wrap: { marginBottom: 14 } satisfies CSSProperties,
  eyebrow: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  eyebrowIcon: { marginRight: 6, verticalAlign: "-2px" } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  stats: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  add: { color: "var(--code-add-text)" } satisfies CSSProperties,
  del: { color: "var(--code-del-text)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  segmented: {
    display: "inline-flex",
    border: "1px solid var(--border)",
    borderRadius: 6,
    overflow: "hidden",
  } satisfies CSSProperties,
} as const;
