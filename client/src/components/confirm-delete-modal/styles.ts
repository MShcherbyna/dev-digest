import type { CSSProperties } from "react";

/** Co-located styles for ConfirmDeleteModal. */
export const s = {
  message: { margin: 0, padding: 24, fontSize: 14, lineHeight: 1.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
