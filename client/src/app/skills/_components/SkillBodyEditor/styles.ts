import type { CSSProperties } from "react";
import { EDITOR_FONT_SIZE, EDITOR_HEIGHT, EDITOR_LINE_HEIGHT } from "./constants";

/** Co-located styles for SkillBodyEditor. Gutter and textarea share font metrics
   so line numbers stay aligned with the text. */
export const s = {
  wrap: {
    border: "1px solid var(--border-strong)",
    borderRadius: 7,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  chip: {
    fontSize: 12,
    padding: "1px 8px",
    borderRadius: 4,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  tokens: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: { display: "flex", height: EDITOR_HEIGHT } satisfies CSSProperties,
  gutter: {
    padding: "10px 8px 10px 12px",
    textAlign: "right",
    fontSize: EDITOR_FONT_SIZE,
    lineHeight: EDITOR_LINE_HEIGHT,
    color: "var(--text-muted)",
    userSelect: "none",
    overflow: "hidden",
    borderRight: "1px solid var(--border)",
    minWidth: 42,
  } satisfies CSSProperties,
  textarea: {
    flex: 1,
    minWidth: 0,
    resize: "none",
    padding: "10px 12px",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: EDITOR_FONT_SIZE,
    lineHeight: EDITOR_LINE_HEIGHT,
    whiteSpace: "pre",
    overflow: "auto",
  } satisfies CSSProperties,
} as const;
