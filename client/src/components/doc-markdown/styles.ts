import type { CSSProperties } from "react";

/** Co-located styles for DocMarkdown (matches the mock: large H1, H2 sections, blue inline-code chips). */
export const s = {
  root: { fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)" } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 24px" } satisfies CSSProperties,
  h2: { fontSize: 17, fontWeight: 600, color: "var(--text-primary)", margin: "28px 0 10px" } satisfies CSSProperties,
  h3: { fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: "20px 0 8px" } satisfies CSSProperties,
  p: { margin: "0 0 10px" } satisfies CSSProperties,
  list: { margin: "0 0 10px", paddingLeft: 20 } satisfies CSSProperties,
  li: { margin: "2px 0" } satisfies CSSProperties,
  strong: { fontWeight: 650, color: "var(--text-primary)" } satisfies CSSProperties,
  code: {
    fontSize: "0.92em",
    padding: "1px 6px",
    borderRadius: 4,
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  pre: {
    margin: "0 0 12px",
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    overflow: "auto",
    fontSize: 12.5,
  } satisfies CSSProperties,
  quote: {
    margin: "0 0 10px",
    paddingLeft: 12,
    borderLeft: "3px solid var(--border-strong)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  alt: { color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,
  link: { color: "var(--accent-text)", textDecoration: "underline" } satisfies CSSProperties,
} as const;
