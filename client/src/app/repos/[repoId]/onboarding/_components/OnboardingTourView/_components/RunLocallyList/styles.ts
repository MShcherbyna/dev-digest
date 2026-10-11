import type { CSSProperties } from "react";
import { s as shared } from "../../styles";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    background: "var(--code-bg)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    minWidth: 0,
  } satisfies CSSProperties,
  index: { width: 14, fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  command: { ...shared.truncate, flex: 1, fontSize: 13, color: "var(--text-primary)" } satisfies CSSProperties,
  copy: {
    display: "grid",
    placeItems: "center",
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 4,
    flexShrink: 0,
  } satisfies CSSProperties,
};
