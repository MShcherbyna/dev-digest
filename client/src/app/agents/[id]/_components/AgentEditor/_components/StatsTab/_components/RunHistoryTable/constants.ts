export type Align = "left" | "right";

export const COLUMNS: ReadonlyArray<{
  key: "timestamp" | "pr" | "tokens" | "cost" | "findings" | "source" | "actions";
  align: Align;
}> = [
  { key: "timestamp", align: "left" },
  { key: "pr", align: "left" },
  { key: "tokens", align: "right" },
  { key: "cost", align: "right" },
  { key: "findings", align: "right" },
  { key: "source", align: "left" },
  { key: "actions", align: "right" },
];

/** Source chip colours: local neutral, CI orange. */
export const SOURCE_COLOR = {
  local: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  ci: { color: "var(--warn)", bg: "var(--warn-bg)" },
} as const;
