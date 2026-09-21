/** Markdown text or a .zip archive containing one skill. */
export const ACCEPT_ATTR = ".md,.zip,text/markdown,application/zip";
export const MODAL_WIDTH = 760;

/** Mirrors the server cap on imported text (spec: reject > 100 KB). */
export const MAX_SKILL_BYTES = 100 * 1024;
/** Archives larger than this are refused before being read. */
export const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024;
/** Preferred entry name inside an archive (case-insensitive). */
export const SKILL_ENTRY_NAME = "skill.md";
