import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 } satisfies CSSProperties,
  icon: { color: "var(--text-muted)" } satisfies CSSProperties,
  cost: { color: "var(--text-primary)" } satisfies CSSProperties,
  tokens: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
