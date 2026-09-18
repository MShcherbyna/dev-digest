import type { Severity } from "@devdigest/ui";

/** Severities shown in the breakdown + popover, in display order (INFO isn't
 *  a real emitted severity today — the shared Finding contract only allows
 *  these 3). */
export const ORDERED_SEVERITIES: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];
