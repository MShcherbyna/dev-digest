/** Bound on concurrently-`running` children per multi-agent run (AC-15). */
export const MULTI_AGENT_CONCURRENCY = 4;

/** Max agents a single multi-run may request (AC-9). */
export const MAX_AGENTS = 8;

/** NFR-2: one `POST /pulls/:id/multi-agent-run` (or retry) call counts as a
 * single request against the rate limit — it never multiplies by agent count. */
export const MULTI_RUN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
