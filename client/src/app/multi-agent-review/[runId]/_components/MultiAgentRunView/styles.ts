import type { CSSProperties } from "react";

export const s = {
  page: { padding: 28, display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,
  headerTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 } satisfies CSSProperties,
  headerLeft: { display: "flex", alignItems: "center", gap: 14 } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  headerRight: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  segmented: { display: "flex", border: "1px solid var(--border-strong)", borderRadius: 7, overflow: "hidden" } satisfies CSSProperties,
  segmentBtn: (active: boolean) =>
    ({
      padding: "6px 14px",
      fontSize: 12.5,
      fontWeight: 600,
      border: "none",
      background: active ? "var(--bg-hover)" : "transparent",
      color: active ? "var(--text-primary)" : "var(--text-muted)",
      cursor: "pointer",
    }) satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 } satisfies CSSProperties,
  prTitle: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  metaMono: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
};
