import type { CSSProperties } from "react";

export const s = {
  card: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 12,
    scrollMarginTop: 16,
  } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  tile: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: "grid",
    placeItems: "center",
    background: "var(--accent-bg)",
    color: "var(--accent)",
    flexShrink: 0,
  } satisfies CSSProperties,
  title: { flex: 1, margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  chevron: {
    display: "grid",
    placeItems: "center",
    width: 28,
    height: 28,
    background: "transparent",
    border: "none",
    borderRadius: 6,
    color: "var(--text-muted)",
    cursor: "pointer",
  } satisfies CSSProperties,
  body: { marginTop: 14 } satisfies CSSProperties,
};
