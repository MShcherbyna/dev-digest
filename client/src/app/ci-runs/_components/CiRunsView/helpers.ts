import { TIME_RANGES, type TimeRangeKey } from "./constants";

/** ISO lower bound for a time-range filter, relative to `now`. */
export function sinceIso(range: TimeRangeKey, now: number = Date.now()): string {
  const ms = TIME_RANGES.find((r) => r.key === range)?.ms ?? 0;
  return new Date(now - ms).toISOString();
}
