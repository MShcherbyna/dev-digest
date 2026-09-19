import type { CSSProperties } from "react";

/** Co-located layout styles for the agent StatsTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 16, maxWidth: 980 } satisfies CSSProperties,
  pair: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
