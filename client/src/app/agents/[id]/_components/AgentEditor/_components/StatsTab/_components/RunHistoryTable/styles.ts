import type { CSSProperties } from "react";
import type { Align } from "./constants";

/** Co-located styles for RunHistoryTable. */
export const s = {
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: (align: Align): CSSProperties => ({
    textAlign: align,
    padding: "0 12px 10px",
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
  }),
  td: (align: Align = "left"): CSSProperties => ({
    textAlign: align,
    padding: "10px 12px",
    color: "var(--text-primary)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  }),
  prLink: { color: "var(--accent-text)", textDecoration: "none" } satisfies CSSProperties,
  traceBtn: {
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontSize: 12,
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
