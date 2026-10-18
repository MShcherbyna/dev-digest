import type { CSSProperties } from "react";

/** Co-located styles for CiTab (screenshot 2 + design/ CI tab). */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 0, minWidth: 0 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" } satisfies CSSProperties,
  h2: { margin: 0, fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  headActions: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
  banner: { marginBottom: 12 } satisfies CSSProperties,
  empty: { maxWidth: 600, margin: "0 auto", textAlign: "center", padding: "40px 0" } satisfies CSSProperties,
  addRow: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "13px 14px",
    borderRadius: 8,
    border: "1px dashed var(--border-strong)",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 13.5,
    cursor: "pointer",
  } satisfies CSSProperties,
  section: { marginTop: 28 } satisfies CSSProperties,
  sectionHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 } satisfies CSSProperties,
  h3: { margin: 0, fontSize: 14, fontWeight: 700 } satisfies CSSProperties,
  viewAll: { marginLeft: "auto", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  recentEmpty: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  failOn: { marginTop: 28, maxWidth: 520 } satisfies CSSProperties,
  loadError: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
