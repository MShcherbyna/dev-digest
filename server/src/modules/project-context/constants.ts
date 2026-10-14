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

/** A chunk never exceeds this many estimated tokens (`ceil(chars/4)`). */
export const MAX_CHUNK_TOKENS = 800;

/** `jobs.kind` of the background index build. */
export const INDEX_JOB_KIND = 'project_context_index';

export const FAILURE_REASONS = ['timeout', 'clone_missing', 'internal_error'] as const;

/** Rows per INSERT statement when persisting an index. */
export const INSERT_BATCH = 1000;
