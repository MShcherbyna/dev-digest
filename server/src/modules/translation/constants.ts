export const TRANSLATION_SCHEMA_NAME = 'FindingTranslations';

export const TRANSLATION_TIMEOUT_MS = 60_000;
export const TRANSLATION_MAX_RETRIES = 1;

/** Human-readable language names for the prompt (the enum values are ISO codes). */
export const LANGUAGE_NAMES = {
  uk: 'Ukrainian',
  ru: 'Russian',
} as const;
