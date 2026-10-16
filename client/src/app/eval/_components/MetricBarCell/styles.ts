import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 } satisfies CSSProperties,
  track: { flex: 1, height: 6, borderRadius: 3, background: "var(--bg-hover)", overflow: "hidden", minWidth: 40 } satisfies CSSProperties,
  fill: (fraction: number, color: string): CSSProperties => ({
    width: `${Math.max(0, Math.min(1, fraction)) * 100}%`,
    height: "100%",
    borderRadius: 3,
    background: color,
  }),
  value: {
    width: 34,
    textAlign: "right",
    fontSize: 12.5,
    color: "var(--text-secondary)",
    flexShrink: 0,
  } satisfies CSSProperties,
};
