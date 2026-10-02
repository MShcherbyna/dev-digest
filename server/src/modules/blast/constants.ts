/** Upper bound for the GitHub changed-files fallback; a slow GitHub must not stall the blast read. */
export const BLAST_GITHUB_DEADLINE_MS = 8_000;

// ---- Prior PRs (history) ---------------------------------------------------
/** Changed files whose history is queried (the rest are ignored). */
export const HISTORY_MAX_FILES = 20;
/** Commits read per file. */
export const HISTORY_COMMITS_PER_FILE = 10;
/** Associated PRs read per commit. */
export const HISTORY_PRS_PER_COMMIT = 3;
/** Prior PRs returned. */
export const HISTORY_MAX_ITEMS = 5;
export const HISTORY_NOTE_MAX = 160;
export const HISTORY_CACHE_TTL_MS = 10 * 60_000;
export const HISTORY_CACHE_MAX = 200;
export const BLAST_HISTORY_DEADLINE_MS = 8_000;
