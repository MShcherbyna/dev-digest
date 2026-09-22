import type { CSSProperties } from "react";

/** White tick drawn as the checked checkbox background. */
const CHECK_ICON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5'/%3E%3C/svg%3E\")";

/** Co-located styles for the agent SkillsTab. */
export const s = {
  wrap: { maxWidth: 720 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  count: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
    padding: "2px 10px",
    borderRadius: 999,
  } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-secondary)", margin: "8px 0 16px" } satisfies CSSProperties,
  filter: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    width: 220,
  } satisfies CSSProperties,
  filterIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  filterInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "8px 0" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  // Selected rows read brighter (primary name, elevated surface); unselected
  // ones recede (muted name, flatter surface). No accent border/fill.
  row: (dragging: boolean, checked: boolean, globallyEnabled: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: checked ? "var(--bg-elevated)" : "var(--bg-surface)",
    opacity: dragging ? 0.4 : globallyEnabled ? 1 : 0.45,
  }),
  handle: { cursor: "grab", color: "var(--text-muted)", display: "inline-flex" } satisfies CSSProperties,
  // Native input, restyled: dark empty box when off (never the browser's white
  // default), accent box with a white tick when on.
  checkbox: (checked: boolean): CSSProperties => ({
    appearance: "none",
    WebkitAppearance: "none",
    width: 16,
    height: 16,
    margin: 0,
    flexShrink: 0,
    borderRadius: 4,
    cursor: "pointer",
    border: "1.5px solid " + (checked ? "var(--accent)" : "var(--border-strong)"),
    backgroundColor: checked ? "var(--accent)" : "var(--bg-surface)",
    backgroundImage: checked ? CHECK_ICON : "none",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "11px 11px",
  }),
  name: (checked: boolean): CSSProperties => ({
    flex: 1,
    fontSize: 14,
    fontWeight: checked ? 600 : 500,
    color: checked ? "var(--text-primary)" : "var(--text-muted)",
  }),
  badge: (checked: boolean): CSSProperties => ({ opacity: checked ? 1 : 0.6 }),
} as const;
