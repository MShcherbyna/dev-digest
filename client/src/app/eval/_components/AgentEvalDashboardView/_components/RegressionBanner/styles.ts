import type { CSSProperties } from "react";

export const s = {
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 18px",
    borderRadius: 10,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    fontSize: 14.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  icon: { color: "var(--warn)", flexShrink: 0 } satisfies CSSProperties,
};
