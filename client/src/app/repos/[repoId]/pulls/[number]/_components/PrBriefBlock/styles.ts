import type { CSSProperties } from "react";
import { REGENERATING_OPACITY } from "./constants";

export const s = {
  stack: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  grid: {
    display: "grid",
    // minmax(0, …): plain 1fr has an automatic minimum, so long unbreakable file paths in the
    // Risk areas would widen the column past the container.
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: 20,
    alignItems: "stretch",
  } satisfies CSSProperties,
  // Risk areas placeholder inside the Intent card. The card is --bg-elevated, the same as the
  // skeleton gradient base, so the bars need their own contour to be visible. Do not set
  // `background` here: it would replace the .skeleton shimmer gradient.
  riskSkeletonList: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  riskSkeletonBar: { border: "1px solid var(--border)", borderRadius: 7 } satisfies CSSProperties,
  content: (dimmed: boolean): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: 20,
    opacity: dimmed ? REGENERATING_OPACITY : 1,
  }),
} as const;
