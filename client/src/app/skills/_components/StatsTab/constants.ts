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

/** Colour for the i-th category segment (wraps around the palette). */
export function categoryColor(i: number): string {
  return CATEGORY_COLORS[i % CATEGORY_COLORS.length] ?? "var(--text-muted)";
}
