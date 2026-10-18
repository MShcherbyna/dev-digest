import type { CSSProperties } from "react";

/** Co-located styles for FailCiOnSelect (mirrors FormField's label + hint). */
export const s = {
  label: { display: "block" } satisfies CSSProperties,
  labelText: { display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.45 } satisfies CSSProperties,
} as const;
