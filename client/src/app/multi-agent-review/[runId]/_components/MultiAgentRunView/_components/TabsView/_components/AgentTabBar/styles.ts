import type { CSSProperties } from "react";

export const s = {
  // overflow-x: auto so many agents scroll within the bar instead of
  // clipping past the page edge (vs. the vendored Tabs, which has no such
  // guard — this is why this bar is a local component, not that one).
  row: {
    display: "flex",
    gap: 2,
    borderBottom: "1px solid var(--border)",
    overflowX: "auto",
  } satisfies CSSProperties,
  tab: (active: boolean) =>
    ({
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "12px 16px",
      border: "none",
      background: "transparent",
      borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
      marginBottom: -1,
      cursor: "pointer",
      fontSize: 14,
      fontWeight: active ? 600 : 500,
      color: active ? "var(--text-primary)" : "var(--text-secondary)",
      whiteSpace: "nowrap",
      flexShrink: 0,
    }) satisfies CSSProperties,
  score: (color: string) =>
    ({
      fontSize: 12,
      fontWeight: 700,
      color,
    }) satisfies CSSProperties,
};
