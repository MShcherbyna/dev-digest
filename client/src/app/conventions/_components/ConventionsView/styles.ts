import type { CSSProperties } from "react";

/** Co-located styles for ConventionsView. */
export const s = {
  page: { padding: "24px 24px 44px", maxWidth: 771 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repoName: { color: "var(--accent)" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  actions: { display: "flex", gap: 10 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
} as const;
