import type { CSSProperties } from "react";

export const s = {
  col: (color: string) =>
    ({
      display: "flex",
      flexDirection: "column",
      gap: 10,
      minWidth: 0,
      borderTop: `3px solid ${color}`,
      background: "var(--bg-elevated)",
      border: "1px solid var(--border)",
      borderTopWidth: 3,
      borderTopColor: color,
      borderRadius: 10,
      padding: 12,
    }) satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  iconTile: (color: string) =>
    ({
      width: 28,
      height: 28,
      borderRadius: 7,
      display: "grid",
      placeItems: "center",
      background: `color-mix(in srgb, ${color} 18%, transparent)`,
      color,
      flexShrink: 0,
    }) satisfies CSSProperties,
  headText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  retryIconBtn: {
    display: "grid",
    placeItems: "center",
    width: 22,
    height: 22,
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-hover)",
    color: "var(--text-muted)",
    cursor: "pointer",
    flexShrink: 0,
  } satisfies CSSProperties,
  name: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  sub: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  findingsList: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  findingCard: (color: string) =>
    ({
      padding: "8px 10px",
      borderRadius: 7,
      background: "var(--bg-surface)",
      borderLeft: `3px solid ${color}`,
    }) satisfies CSSProperties,
  findingTitle: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  findingMeta: { fontSize: 11, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  alsoFlagged: { fontSize: 10.5, color: "var(--accent-text)", marginTop: 3 } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTop: "1px solid var(--border)",
    // Always sits at the card's bottom edge, regardless of how much (or how
    // little) content is above it — e.g. when flex-stretch makes this card
    // as tall as a sibling with far more findings.
    marginTop: "auto",
  } satisfies CSSProperties,
  footerLink: {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 12,
    color: "var(--text-muted)",
    cursor: "pointer",
  } satisfies CSSProperties,
  footerCount: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { fontSize: 12.5, color: "var(--text-muted)", padding: "8px 0" } satisfies CSSProperties,
};
