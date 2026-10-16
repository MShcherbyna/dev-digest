import { ApiError } from "@/lib/api";

const KNOWN = ["undecided", "diff_unavailable", "range_outside_diff", "agent_missing"] as const;

/** Maps a failed create-case request onto a `finding.evalCase.errors.*` message key. */
export function errorKey(e: unknown): (typeof KNOWN)[number] | "network" | "generic" {
  if (!(e instanceof ApiError)) return "generic";
  if (e.status === 0) return "network";
  return KNOWN.find((k) => k === e.code) ?? "generic";
}
