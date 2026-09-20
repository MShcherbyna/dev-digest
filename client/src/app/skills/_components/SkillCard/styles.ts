import type { CSSProperties } from "react";
import { DESCRIPTION_LINES } from "./constants";

/** Co-located styles for SkillCard (mirrors AgentCard). */
export const s = {
  card: (enabled: boolean): CSSProperties => ({
    padding: 14,
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    opacity: enabled ? 1 : 0.6,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    background: "var(--accent-bg)",
    color: "var(--accent)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  } satisfies CSSProperties,
  name: {
    fontSize: 14,
    fontWeight: 600,
    flex: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  deleteBtn: (pending: boolean): CSSProperties => ({
    background: "none",
    border: "none",
    cursor: pending ? "not-allowed" : "pointer",
    color: "var(--text-muted)",
    display: "inline-flex",
    padding: 4,
  }),
  spin: { animation: "ddspin 1s linear infinite" } satisfies CSSProperties,
  description: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: "8px 0",
    lineHeight: 1.4,
    display: "-webkit-box",
    WebkitLineClamp: DESCRIPTION_LINES,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  agents: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
