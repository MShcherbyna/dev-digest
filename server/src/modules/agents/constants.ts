/** Constants for the agents module. */

/** Initial config version recorded for a newly-created agent. */
export const INITIAL_AGENT_VERSION = 1;

/** Default agent description when none is supplied on insert. */
export const DEFAULT_AGENT_DESCRIPTION = '';

/** Rolling window (days) for the agent Stats tab. */
export const STATS_WINDOW_DAYS = 30;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Number of weekly severity buckets (w1 oldest … w6 current). */
export const SEVERITY_WEEKS = 6;

/** How many runs the Stats tab's "recent runs" table shows. */
export const RECENT_RUNS_LIMIT = 20;

/** Max memory items listed in the Stats tab. */
export const MEMORY_USAGE_LIMIT = 5;
