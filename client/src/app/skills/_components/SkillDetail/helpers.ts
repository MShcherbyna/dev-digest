import { TABS } from "./constants";

/** Validate the `?tab=` value; unknown/missing falls back to Config. */
export function resolveTab(raw: string | null): string {
  return TABS.some((tb) => tb.key === raw) ? (raw as string) : "config";
}
