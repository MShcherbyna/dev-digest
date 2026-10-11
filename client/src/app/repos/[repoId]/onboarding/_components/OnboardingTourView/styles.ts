import type { CSSProperties } from "react";

/** Shared look for the onboarding view and its sections (design screenshots 21/22). */
export const s = {
  page: { display: "flex", gap: 22, padding: "24px 22px 48px", alignItems: "flex-start" } satisfies CSSProperties,
  rail: { width: 140, flexShrink: 0, position: "sticky", top: 24 } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  stack: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 } satisfies CSSProperties,
  /** Single-line ellipsis; pair with title={full text}. */
  truncate: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  mono: { fontSize: 13 } satisfies CSSProperties,
};
