/* chart-colors.ts — donut geometry + category palette shared by the skill and
   agent Stats tabs. */

/** Donut geometry. */
export const DONUT_SIZE = 140;
export const DONUT_STROKE = 24;

/** Category segment colours (CSS tokens), cycled by index. */
export const CATEGORY_COLORS = [
  "var(--accent)",
  "var(--warn)",
  "var(--crit)",
  "var(--info)",
  "var(--ok)",
  "var(--text-muted)",
] as const;

/** Stacked severity series colours (Critical / Warning / Suggestion). */
export const SEVERITY_COLORS = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--accent)",
} as const;

/** Usage-bar colours: skills are blue, pulled memory is purple. */
export const SKILL_BAR_COLOR = "var(--accent)";
export const MEMORY_BAR_COLOR = "#a78bfa";

/** Colour for the i-th category segment (wraps around the palette). */
export function categoryColor(i: number): string {
  return CATEGORY_COLORS[i % CATEGORY_COLORS.length] ?? "var(--text-muted)";
}
