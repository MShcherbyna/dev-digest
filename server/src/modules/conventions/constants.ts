/** Number of top-ranked files sent to the model as convention samples. */
export const SAMPLE_FILE_COUNT = 12;

/** Per-file and total character budgets for the prompt (keeps the cheap model's context small). */
export const MAX_CHARS_PER_FILE = 6_000;
export const MAX_CHARS_TOTAL = 60_000;

/** Config files looked up at the repo root; missing ones are skipped. */
export const CONFIG_FILE_CANDIDATES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  'prettier.config.js',
] as const;

/** Cheap default for conventions: DeepSeek via OpenRouter (workspace override wins). */
export const DEFAULT_CONVENTIONS_PROVIDER = 'openrouter' as const;
export const DEFAULT_CONVENTIONS_MODEL = 'deepseek/deepseek-v4-flash';

export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

/** Lines of code kept as the evidence snippet shown on a card. */
export const SNIPPET_LINES = 3;
/** How far (in lines) the model's quoted code may be from the line it cited. */
export const LINE_TOLERANCE = 3;

export const MAX_RULE_LENGTH = 300;
export const MAX_CONVENTIONS = 30;

export const SKILL_BODY_TITLE = '# Repo conventions';
