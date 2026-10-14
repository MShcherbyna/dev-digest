export const DIFF_MAX_CHARS = 1_000_000;
export const NAME_MAX = 120;
export const TAB_KEYS = ["diff", "files", "meta"] as const;
export type InputTab = (typeof TAB_KEYS)[number];
export const EMPTY_EXPECTED = "[]";
