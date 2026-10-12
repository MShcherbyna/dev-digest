import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    fontSize: 13,
    lineHeight: 1.45,
    color: "var(--text-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  icon: { color: "var(--crit)", flexShrink: 0 } satisfies CSSProperties,
  link: { color: "var(--accent-text)" } satisfies CSSProperties,
} as const;
