import type { CSSProperties } from "react";

export const s = {
  // Grid, not a scrolling flex row: a fixed max-4-per-row column count
  // (min(agentCount, 4) tracks) wraps a 5th+ agent to a new row at the same
  // card width, instead of forcing horizontal scroll past the page edge.
  row: (agentCount: number) =>
    ({
      display: "grid",
      gridTemplateColumns: `repeat(${Math.max(1, Math.min(agentCount, 4))}, minmax(260px, 1fr))`,
      gap: 14,
    }) satisfies CSSProperties,
};
