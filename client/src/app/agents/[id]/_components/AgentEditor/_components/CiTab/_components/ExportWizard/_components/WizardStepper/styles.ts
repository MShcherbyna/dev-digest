import type { CSSProperties } from "react";

/** Co-located styles for WizardStepper. */
export const s = {
  visuallyHidden: {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0,
    listStyle: "none",
  } satisfies CSSProperties,
} as const;
