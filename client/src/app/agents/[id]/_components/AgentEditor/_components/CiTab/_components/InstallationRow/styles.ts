import type { CSSProperties } from "react";

/** Co-located styles for InstallationRow (screenshot 2). */
export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "13px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  // flex-basis keeps "owner/repo" readable; the badges wrap to the next line instead.
  repo: { fontSize: 13, fontWeight: 600, flex: "1 1 180px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  time: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  prLink: { color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 } satisfies CSSProperties,
} as const;
