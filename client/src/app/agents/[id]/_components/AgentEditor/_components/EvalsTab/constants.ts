/** Colours of the three metric tiles (screenshot 6): recall blue, precision green, citation amber. */
export const METRIC_COLOR = {
  recall: "var(--accent-text)",
  precision: "var(--ok)",
  citation_accuracy: "var(--warn)",
} as const;

export type MetricKey = keyof typeof METRIC_COLOR;

export const METRIC_KEYS: readonly MetricKey[] = ["recall", "precision", "citation_accuracy"];
