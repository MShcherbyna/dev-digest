import type { CSSProperties } from "react";
import { s as shared } from "../../styles";

export const s = {
  grid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 } satisfies CSSProperties,
  card: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 8,
    padding: "14px 16px",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    minWidth: 0,
  } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.35, ...shared.truncate, maxWidth: "100%" } satisfies CSSProperties,
  path: { ...shared.truncate, maxWidth: "100%", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  pill: {
    padding: "2px 8px",
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 4,
    border: "1px solid",
    background: "transparent",
  } satisfies CSSProperties,
};
