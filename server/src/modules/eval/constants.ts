/** Error codes returned in the `{ error: { code } }` envelope by the eval module. */
export const EVAL_ERROR = {
  notFound: 'not_found',
  validation: 'validation_error',
  caseExists: 'eval_case_exists',
  caseRunning: 'eval_case_running',
  runActive: 'eval_run_active',
  undecided: 'undecided',
  diffUnavailable: 'diff_unavailable',
  rangeOutsideDiff: 'range_outside_diff',
  agentMissing: 'agent_missing',
  diffUnparsable: 'diff_unparsable',
  diffTooLarge: 'diff_too_large',
  expectationOutsideDiff: 'expectation_outside_diff',
  noCases: 'no_cases',
  compareCrossAgent: 'compare_cross_agent',
  compareNotFinished: 'compare_not_finished',
} as const;
export type EvalErrorCode = (typeof EVAL_ERROR)[keyof typeof EVAL_ERROR];

export const NAME_MAX = 120;
export const NOTES_MAX = 2000;
/** Max characters of a case diff; enforced by the service so the code is `diff_too_large`. */
export const DIFF_MAX_CHARS = 1_000_000;
/** Fastify body limit for case create/update so a max-size diff reaches the service check. */
export const CASE_BODY_LIMIT_BYTES = 4 * 1024 * 1024;
export const SLUG_MAX = 60;
export const RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
/** Rows on the all-agents "recent runs" table. */
export const RECENT_RUNS_LIMIT = 20;
/** Points on a card's recall sparkline. */
export const SPARKLINE_POINTS = 10;
/** Max characters of an error message stored as a per-case `error_reason`. */
export const ERROR_REASON_MAX = 200;

/** Reason strings stored on runs / per-case results. */
export const EVAL_REASON = {
  interrupted: 'interrupted',
  agentDeleted: 'agent_deleted',
  missingApiKey: 'missing_api_key',
  caseDeleted: 'case_deleted',
} as const;
