/** Constants for the skills module. */

/** Hard cap on an imported .md file, in bytes (spec: reject > 100 KB). */
export const MAX_IMPORT_BYTES = 100 * 1024;

/** Window (days) for usage stats: pull rate, accept rate, findings. */
export const STATS_WINDOW_DAYS = 30;

/** First version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Max lengths matching the SkillCreate contract, used when deriving import fields. */
export const MAX_NAME_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 1000;
