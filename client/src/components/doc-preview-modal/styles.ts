import type { CSSProperties } from "react";

/** Co-located styles for DocPreviewModal. */
export const s = {
  body: { padding: "20px 28px", minHeight: 120 } satisfies CSSProperties,
  notice: { margin: 0, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
