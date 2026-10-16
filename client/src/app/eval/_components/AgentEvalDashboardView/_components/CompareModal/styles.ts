import type { CSSProperties } from "react";

export const s = {
  body: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
};
