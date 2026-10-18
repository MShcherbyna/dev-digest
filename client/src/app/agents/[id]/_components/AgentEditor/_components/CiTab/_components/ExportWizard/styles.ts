import type { CSSProperties } from "react";

/** Co-located styles for the ExportWizard shell (screenshots 1, 3, 5, 6). */
export const s = {
  stepper: { padding: "18px 20px", borderBottom: "1px solid var(--border)", position: "relative" } satisfies CSSProperties,
  body: { padding: 20 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center" } satisfies CSSProperties,
  footerEnd: { marginLeft: "auto" } satisfies CSSProperties,
  repoSelect: { marginBottom: 14, maxWidth: 360 } satisfies CSSProperties,
  repoLabel: { display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
} as const;
