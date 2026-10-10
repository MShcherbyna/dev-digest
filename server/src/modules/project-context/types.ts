import type { DocType } from './constants.js';

/**
 * Application-layer shapes for the project-context module. Plain TS only: no
 * zod, fastify or drizzle. `schemas.ts` (presentation) must stay assignable to
 * these; the compile-time checks live there.
 */

export type SkipReason = 'missing' | 'too_large' | 'invalid_path' | 'unreadable' | 'empty';

/** One resolved attachment in the run trace (AC-31). */
export interface ProjectContextDocEntry {
  path: string;
  origin: 'agent' | 'skill';
  skill?: string | undefined;
  status: 'included' | 'skipped';
  reason?: SkipReason | undefined;
  tokens?: number | undefined;
}

export interface ContextFile {
  path: string;
  type: DocType;
  size: number;
  tokens: number;
  too_large: boolean;
  used_by: number;
}

export interface ContextListing {
  glob: string;
  scanned_at: string;
  cloned: boolean;
  truncated: boolean;
  total: number;
  files: ContextFile[];
}

export interface ContextFileContent {
  path: string;
  content: string;
  size: number;
  tokens: number;
}

export interface ContextPaths {
  paths: string[];
}
