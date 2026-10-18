import type { CSSProperties } from "react";

/** Co-located styles for CiRefreshBanner. */
export const s = {
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    fontSize: 13,
  } satisfies CSSProperties,
  icon: { color: "var(--warn)", flexShrink: 0 } satisfies CSSProperties,
  text: { flex: 1, color: "var(--text-primary)" } satisfies CSSProperties,
} as const;
