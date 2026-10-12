import type { CSSProperties } from "react";
import { REGENERATING_OPACITY } from "./constants";

export const s = {
  stack: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
    alignItems: "stretch",
  } satisfies CSSProperties,
  content: (dimmed: boolean): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: 20,
    opacity: dimmed ? REGENERATING_OPACITY : 1,
  }),
} as const;
