import type { CSSProperties } from "react";

/** Co-located styles for EvalDashboardView (screenshot 3). */
export const s = {
  page: { padding: "32px 32px 44px", maxWidth: 1280, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 6 } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", margin: "8px 0 0" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 } satisfies CSSProperties,
  sectionGap: { marginTop: 16 } satisfies CSSProperties,
};
