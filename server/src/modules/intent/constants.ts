/** Fallback when the workspace hasn't picked a model for `review_intent` in Settings. */
export const DEFAULT_INTENT_PROVIDER = 'openrouter' as const;
export const DEFAULT_INTENT_MODEL = 'deepseek/deepseek-v4-flash';

export const CLASSIFICATION_SCHEMA_NAME = 'IntentClassification';

export const INTENT_TIMEOUT_MS = 20_000;
export const INTENT_MAX_RETRIES = 1;

/** Model-output bounds. */
export const MAX_INTENT_CHARS = 300;
export const MAX_ITEM_CHARS = 120;
export const MAX_ITEMS = 6;

/** Source caps. */
export const MAX_DOCS = 3;
export const MAX_DOC_CHARS = 8_000;
export const MAX_DOCS_TOTAL_CHARS = 20_000;
export const MAX_ISSUE_CHARS = 4_000;
export const MAX_BODY_CHARS = 6_000;
export const MAX_COMMITS = 30;
export const MAX_PATHS = 200;
export const MAX_EXTERNAL_LINKS = 5;

/** A description shorter than this (after stripping template headings) is not "documentation". */
export const MIN_DOC_CHARS = 80;

/** Linked docs are fetched only when they carry one of these extensions. */
export const DOC_EXTENSIONS = ['md', 'mdx', 'txt', 'rst', 'adoc'] as const;

/** Max wait for the fresh GitHub read before falling back to persisted data. */
export const GITHUB_DEADLINE_MS = 8_000;
