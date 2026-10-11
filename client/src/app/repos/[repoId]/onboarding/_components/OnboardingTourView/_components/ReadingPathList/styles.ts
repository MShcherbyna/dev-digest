import type { CSSProperties } from "react";
import { s as shared } from "../../styles";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  item: { display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0 } satisfies CSSProperties,
  badge: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 600,
    background: "var(--accent-bg)",
    color: "var(--accent)",
  } satisfies CSSProperties,
  text: { minWidth: 0, flex: 1 } satisfies CSSProperties,
  path: { ...shared.truncate, fontSize: 13.5, color: "var(--text-primary)" } satisfies CSSProperties,
  reason: { ...shared.truncate, marginTop: 4, fontSize: 13.5, color: "var(--text-muted)" } satisfies CSSProperties,
};
