import type { CSSProperties } from "react";

/** Co-located styles for the SERIALIZES AS box (shared by the agent and skill Context tabs). */
export const s = {
  label: {
    margin: "22px 0 8px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  box: {
    margin: 0,
    padding: "14px 18px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 13,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
} as const;
