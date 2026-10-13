/** Output limits (AC-8, AC-19). */
export const MAX_FOCUS_ITEMS = 5;
export const MAX_RISKS = 5;

/**
 * Role order for the files sent to the model (AC-30). Deliberately the spec's
 * literal order, not the Smart Diff `ROLE_ORDER`.
 */
export const BRIEF_ROLE_ORDER = ['core', 'wiring', 'tests', 'docs', 'boilerplate'] as const;

export const BRIEF_TIMEOUT_MS = 60_000;

/** Closed set of risk kinds; anything else is normalised to `other` (AC-20). */
export const RISK_KINDS = [
  'security',
  'dependency',
  'performance',
  'data',
  'api_contract',
  'config',
  'other',
] as const;

export const BRIEF_SCHEMA_NAME = 'PrBriefOutput';
export const OUTPUT_MAX_TOKENS = 2_000;
export const LOG_CAUSE_MAX_CHARS = 300;

/** Marker appended to text cut by the token caps. */
export const TRUNCATED_MARKER = '…[truncated]';

// ---- Input token budget (estimated tokens = ceil(chars / 4)) --------------
export const INPUT_BUDGET_TOKENS = 12_000;
export const INPUT_TARGET_TOKENS = 11_000;
export const SPEC_DOC_BUDGET_TOKENS = 8_000;
export const DOC_WRAP_OVERHEAD_TOKENS = 30;
export const MIN_DOC_TOKENS = 200;

export const SYSTEM_PROMPT_MAX_TOKENS = 800;
export const TITLE_MAX_TOKENS = 100;
export const DESCRIPTION_MAX_TOKENS = 600;
export const INTENT_MAX_TOKENS = 300;
export const BLAST_MAX_TOKENS = 400;

export const FINDINGS_MAX_TOKENS = 500;
export const MAX_FINDINGS_SENT = 20;
export const FINDING_TITLE_MAX_CHARS = 120;

export const FILES_MAX_TOKENS = 3_000;
export const MAX_FILES_SENT = 200;
export const MAX_HUNKS_PER_FILE_SENT = 5;

/** Literal markers for unavailable facts (S5). */
export const INTENT_UNAVAILABLE = 'INTENT UNAVAILABLE';
export const BLAST_UNAVAILABLE = 'BLAST RADIUS UNAVAILABLE';
export const NONE = 'none';
