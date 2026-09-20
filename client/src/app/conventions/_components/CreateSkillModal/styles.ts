import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillModal. */
export const s = {
  body: { padding: 24 } satisfies CSSProperties,
  banner: {
    padding: "12px 14px",
    marginBottom: 20,
    borderRadius: 8,
    border: "1px solid var(--accent)",
    background: "var(--accent-bg)",
    color: "var(--text-secondary)",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  bannerStrong: { color: "var(--text-primary)", fontWeight: 700 } satisfies CSSProperties,
  bannerLink: { color: "var(--accent)", textDecoration: "none" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  hint: { flex: 1, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
