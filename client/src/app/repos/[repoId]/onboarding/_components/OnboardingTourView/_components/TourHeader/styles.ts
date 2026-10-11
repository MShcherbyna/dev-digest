import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 } satisfies CSSProperties,
  titleBlock: { minWidth: 0 } satisfies CSSProperties,
  title: { margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" } satisfies CSSProperties,
  repo: { color: "var(--accent)", fontWeight: 600 } satisfies CSSProperties,
  subtitle: { marginTop: 8, fontSize: 13.5, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, flexShrink: 0 } satisfies CSSProperties,
};
