import type { EvalRange } from "@/lib/hooks/eval";

export const RANGES: readonly EvalRange[] = ["7d", "30d", "90d", "all"];
export const DEFAULT_RANGE: EvalRange = "30d";
/** Max runs the table shows before "Show more" (P2-E-9). */
export const RUNS_PAGE_SIZE = 50;
/** A comparison is always between exactly two runs. */
export const COMPARE_SIZE = 2;
