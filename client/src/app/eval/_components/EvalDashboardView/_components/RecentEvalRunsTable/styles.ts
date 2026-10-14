import type { CSSProperties } from "react";

/** Column template shared by the header row and every body row. */
export const COLUMNS = "minmax(120px,1.4fr) 150px 56px repeat(3, minmax(120px,1.2fr)) 64px";

export const s = {
  table: { border: "1px solid var(--border)", borderRadius: 12, background: "var(--bg-surface)", overflow: "hidden" } satisfies CSSProperties,
  head: {
    display: "grid",
    gridTemplateColumns: COLUMNS,
    gap: 16,
    padding: "10px 20px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  row: {
    display: "grid",
    gridTemplateColumns: COLUMNS,
    gap: 16,
    alignItems: "center",
    padding: "14px 20px",
    borderBottom: "1px solid var(--border)",
    fontSize: 14,
  } satisfies CSSProperties,
  agent: { fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  date: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  version: { color: "var(--accent-text)", fontSize: 13 } satisfies CSSProperties,
  pass: { fontWeight: 600 } satisfies CSSProperties,
  empty: { padding: "20px", fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
};
