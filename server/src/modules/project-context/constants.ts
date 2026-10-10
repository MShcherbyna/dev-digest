/** Default discovery glob (forward-slash repo-relative paths). */
export const DEFAULT_DOC_GLOB = '**/{specs,docs,insights}/**/*.md';

/** Per-document size cap (3 MiB). Above it a doc is `too_large`. */
export const MAX_DOC_BYTES = 3 * 1024 * 1024;

/** Discovery returns at most this many documents (sorted by path). */
export const MAX_DISCOVERED = 2000;

/** Bounded concurrency for reading matched docs (token counts). */
export const READ_CONCURRENCY = 16;

/**
 * Directories never traversed, at any depth. Module-local copy of
 * `repo-intel/constants.ts` EXCLUDED_DIRS (a module must not import another
 * module's constants).
 */
export const EXCLUDED_DIRS: readonly string[] = [
  'node_modules',
  '.git',
  'vendor',
  'dist',
  'build',
  '.next',
  'coverage',
  'out',
];

export const DOC_TYPES = ['specs', 'docs', 'insights'] as const;
export type DocType = (typeof DOC_TYPES)[number];
