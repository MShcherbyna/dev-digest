import type { IconName } from "@devdigest/ui";

/** Section keys in page order; also the keys of the persisted collapse map. */
export const SECTION_KEYS = [
  "architecture",
  "critical-paths",
  "run-locally",
  "reading-path",
  "first-tasks",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_ICONS: Record<SectionKey, IconName> = {
  architecture: "Boxes",
  "critical-paths": "Activity",
  "run-locally": "Command",
  "reading-path": "ListChecks",
  "first-tasks": "Target",
};

/** localStorage key: JSON map of section key -> true (collapsed). Never sent to the server. */
export const COLLAPSE_STORAGE_KEY = "dd-onboarding-collapsed";

/** Server error codes the view handles itself (no toast, no failure state). */
export const QUIET_ERROR_CODES = ["generation_in_progress", "not_cloned"] as const;
export const MISSING_KEY_CODE = "missing_api_key";

/** A section is "active" while its top is in the upper 30% of the viewport. */
export const ACTIVE_ROOT_MARGIN = "0px 0px -70% 0px";
