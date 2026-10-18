import type { CSSProperties } from "react";

/** Co-located styles for TargetStep (screenshot 1). */
export const s = {
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } satisfies CSSProperties,
  card: {
    padding: 16,
    borderRadius: 10,
    background: "var(--bg-surface)",
    border: "1.5px solid var(--border)",
    height: "100%",
    boxSizing: "border-box",
  } satisfies CSSProperties,
  cardChecked: { border: "1.5px solid var(--accent)" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    background: "var(--bg-elevated)",
    display: "grid",
    placeItems: "center",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  desc: { fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0" } satisfies CSSProperties,
  field: { marginBottom: 18, maxWidth: 420 } satisfies CSSProperties,
  fieldLabel: { display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginTop: 8 } satisfies CSSProperties,
} as const;
