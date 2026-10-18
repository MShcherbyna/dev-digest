import type { CSSProperties } from "react";

export const s = {
  card: (selected: boolean, color: string) =>
    ({
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
      padding: 14,
      borderRadius: 10,
      border: `1px solid ${selected ? color : "var(--border)"}`,
      background: "var(--bg-elevated)",
      cursor: "pointer",
    }) satisfies CSSProperties,
  iconTile: (color: string) =>
    ({
      width: 32,
      height: 32,
      borderRadius: 8,
      display: "grid",
      placeItems: "center",
      background: `color-mix(in srgb, ${color} 18%, transparent)`,
      color,
      flexShrink: 0,
    }) satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 } satisfies CSSProperties,
  headRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  estimate: { fontSize: 11.5, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  summary: { fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.4 } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
};
