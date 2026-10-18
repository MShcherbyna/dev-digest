import type { CSSProperties } from "react";

export const s = {
  page: { padding: 28, maxWidth: 760, marginLeft: "auto", marginRight: "auto" } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  } satisfies CSSProperties,
  heading: { fontSize: 15, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  } satisfies CSSProperties,
  rowLeft: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 } satisfies CSSProperties,
  rowTitle: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  rowMeta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  rowRight: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 } satisfies CSSProperties,
};
