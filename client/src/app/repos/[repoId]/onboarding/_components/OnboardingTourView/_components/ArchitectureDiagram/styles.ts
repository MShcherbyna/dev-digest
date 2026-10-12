import type { CSSProperties } from "react";

export const s = {
  panel: {
    marginTop: 16,
    background: "var(--code-bg)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflowX: "auto",
    display: "flex",
    justifyContent: "center",
  } satisfies CSSProperties,
  svg: { display: "block", flexShrink: 0 } satisfies CSSProperties,
};
