import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillModal. */
export const s = {
  body: { padding: 24 } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  hiddenInput: { display: "none" } satisfies CSSProperties,
  error: { marginTop: 12, fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  preview: { marginTop: 20 } satisfies CSSProperties,
  trust: {
    padding: "10px 14px",
    marginBottom: 16,
    borderRadius: 7,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  warnings: {
    padding: "10px 14px",
    marginBottom: 16,
    borderRadius: 7,
    background: "var(--bg-hover)",
    fontSize: 13,
  } satisfies CSSProperties,
  warningList: { margin: "6px 0 0", paddingLeft: 18 } satisfies CSSProperties,
} as const;
