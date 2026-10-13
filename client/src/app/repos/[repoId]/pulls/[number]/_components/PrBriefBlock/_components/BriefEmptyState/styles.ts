import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    textAlign: "center",
    padding: "28px 18px",
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  icon: { color: "var(--text-muted)" } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.45, maxWidth: 420, marginBottom: 6 } satisfies CSSProperties,
} as const;
