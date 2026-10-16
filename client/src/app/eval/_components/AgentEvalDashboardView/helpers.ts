import type { EvalAgentRun, EvalRange } from "@/lib/hooks/eval";
import { COMPARE_SIZE, DEFAULT_RANGE, RANGES } from "./constants";

/** `?range=` value -> a valid range; anything unknown falls back to the default. */
export function parseRange(raw: string | null | undefined): EvalRange {
  return RANGES.find((r) => r === raw) ?? DEFAULT_RANGE;
}

/** Only finished (done / partial) runs can be compared. */
export function isSelectable(run: EvalAgentRun): boolean {
  return run.status === "done" || run.status === "partial";
}

/** Toggle a run id in the selection; a third distinct run is refused (`blocked`). */
export function toggleSelection(
  selected: string[],
  id: string,
): { selected: string[]; blocked: boolean } {
  if (selected.includes(id)) return { selected: selected.filter((x) => x !== id), blocked: false };
  if (selected.length >= COMPARE_SIZE) return { selected, blocked: true };
  return { selected: [...selected, id], blocked: false };
}
