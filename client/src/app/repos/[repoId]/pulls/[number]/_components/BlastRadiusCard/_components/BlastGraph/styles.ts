import type { CSSProperties } from "react";
import type { GraphNodeKind } from "./helpers";

/** Co-located styles for BlastGraph (4.png). */
const mono = { fontFamily: "var(--font-mono)", fontSize: 13 } satisfies CSSProperties;

const stroke: Record<GraphNodeKind, string> = {
  symbol: "var(--accent)",
  caller: "var(--border-strong)",
  endpoint: "var(--accent)",
  cron: "var(--warn)",
};

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  picker: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  select: {
    ...mono,
    fontSize: 12.5,
    color: "var(--text-primary)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "3px 8px",
  } satisfies CSSProperties,
  svg: { display: "block", width: "100%", height: "auto", overflow: "hidden" } satisfies CSSProperties,
  edge: { fill: "none", stroke: "var(--border-strong)", strokeWidth: 1.5, opacity: 0.7 } satisfies CSSProperties,
  rect: (kind: GraphNodeKind): CSSProperties => ({
    fill: "var(--bg-elevated)",
    stroke: stroke[kind],
    strokeWidth: kind === "caller" ? 1.5 : 2,
  }),
  text: (kind: GraphNodeKind): CSSProperties => ({
    ...mono,
    fontWeight: kind === "symbol" ? 600 : 400,
    fill: kind === "cron" ? "var(--warn)" : "var(--text-primary)",
  }),
  legend: { display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  dot: { width: 9, height: 9, borderRadius: "50%", background: "var(--text-muted)" } satisfies CSSProperties,
} as const;
