import type { CSSProperties } from "react";

/** Co-located styles for RemoveInstallationDialog (same look as ConfirmDeleteModal). */
export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  message: { margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  error: { margin: 0, fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
