import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  note: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12.5,
    lineHeight: 1.45,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
