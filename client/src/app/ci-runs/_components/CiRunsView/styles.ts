import type { CSSProperties } from "react";

/** Co-located styles for CiRunsView (design: CI Runs, N13). */
export const s = {
  page: { padding: "0 28px 40px" } satisfies CSSProperties,
  header: { padding: "20px 0 6px", display: "flex", alignItems: "flex-end", gap: 12 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", margin: "3px 0 0" } satisfies CSSProperties,
  headRight: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  live: { fontSize: 11.5, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 5 } satisfies CSSProperties,
  liveDot: { width: 6, height: 6, borderRadius: 99, background: "var(--ok)" } satisfies CSSProperties,
  filters: { display: "flex", gap: 8, padding: "12px 0", flexWrap: "wrap" } satisfies CSSProperties,
  banner: { marginBottom: 8 } satisfies CSSProperties,
} as const;
