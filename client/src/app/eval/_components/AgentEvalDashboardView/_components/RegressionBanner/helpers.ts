import type { EvalMetric } from "@/lib/hooks/eval";

/** Joins names as a language-aware list ("Recall and citation"). */
export function joinList(items: string[], locale: string): string {
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(items);
}

/** First letter upper-case, rest lower: "Citation" -> "citation" for mid-sentence use. */
export const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
export const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const METRIC_ORDER: readonly EvalMetric[] = ["recall", "precision", "citation_accuracy"];
