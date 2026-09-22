import type { CSSProperties } from "react";

/** Co-located styles for VersionsTab. */
export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, maxWidth: 820, display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  item: {
    padding: 14,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  row: (open: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: open ? 10 : 0,
  }),
  actions: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  version: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: {
    margin: 0,
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-primary)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: 360,
    overflow: "auto",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
