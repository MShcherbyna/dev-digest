import type { CSSProperties } from "react";

/** Co-located styles for PreviewTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 28, maxWidth: 820 } satisfies CSSProperties,
  card: {
    padding: 18,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 14,
  } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginTop: -6, marginBottom: 10 } satisfies CSSProperties,
  warn: { fontSize: 12, color: "var(--warn)", marginBottom: 10 } satisfies CSSProperties,
  pre: {
    margin: 0,
    padding: 16,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 13,
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  } satisfies CSSProperties,
} as const;
