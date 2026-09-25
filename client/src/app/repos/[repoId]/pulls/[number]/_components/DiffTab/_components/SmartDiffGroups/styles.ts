import type { CSSProperties } from "react";

/** Co-located styles for SmartDiffGroups, reusing the diff-viewer visual language. */
export const s = {
  section: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    cursor: "pointer",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  label: { fontSize: 13, fontWeight: 700 } satisfies CSSProperties,
  description: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  findingFilesDot: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    color: "var(--crit)",
  } satisfies CSSProperties,
  filesCount: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: {
    borderTop: "1px solid var(--border)",
    padding: "10px 12px",
    background: "var(--bg-surface)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  groupsList: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;

/** Chevron rotates 90deg when the group is expanded. */
export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}
