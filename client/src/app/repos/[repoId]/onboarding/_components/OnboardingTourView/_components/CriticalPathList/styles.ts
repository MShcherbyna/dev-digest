import type { CSSProperties } from "react";
import { s as shared } from "../../styles";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    background: "var(--bg-elevated)",
    borderRadius: 8,
    minWidth: 0,
  } satisfies CSSProperties,
  icon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  text: { ...shared.truncate, flex: 1, fontSize: 13.5 } satisfies CSSProperties,
  path: { color: "var(--text-primary)" } satisfies CSSProperties,
  desc: { color: "var(--text-secondary)" } satisfies CSSProperties,
  open: {
    flexShrink: 0,
    padding: "5px 10px",
    fontSize: 12.5,
    fontWeight: 500,
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    textDecoration: "none",
  } satisfies CSSProperties,
};
