import type { DocType, FAILURE_REASONS } from './constants.js';

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

export type IndexStatus = 'none' | 'indexing' | 'ready' | 'failed';
export type FailureReason = (typeof FAILURE_REASONS)[number];

export interface ContextIndexInfo {
  status: IndexStatus;
  indexed_at: string | null;
  indexed_sha: string | null;
  files: number;
  chunks: number;
  failed_at?: string | undefined;
  failure_reason?: FailureReason | undefined;
}

export interface ContextListing {
  glob: string;
  cloned: boolean;
  truncated: boolean;
  total: number;
  stale: boolean;
  index: ContextIndexInfo;
  files: ContextFile[];
}

export interface ReindexAccepted {
  status: 'accepted';
  job_id: string;
}

/** One manifest row of the persisted index. */
export interface ManifestEntry {
  path: string;
  type: DocType;
  size: number;
  tokens: number;
  /** null for too_large and I/O-unreadable files (content never read). */
  contentHash: string | null;
  tooLarge: boolean;
  unreadable: boolean;
  empty: boolean;
}

export interface ChunkRecord {
  ordinal: number;
  breadcrumb: string[];
  startOffset: number;
  endOffset: number;
  tokens: number;
  text: string;
  contentHash: string;
}

/** A full in-memory index, ready to be persisted atomically. */
export interface IndexBuild {
  indexedSha: string;
  glob: string;
  truncated: boolean;
  total: number;
  files: (ManifestEntry & { chunks: ChunkRecord[] })[];
}

/** Persisted state row: the last finished outcome (`indexing` is never stored). */
export interface IndexStateRecord {
  status: 'ready' | 'failed';
  indexedAt: Date | null;
  indexedSha: string | null;
  glob: string | null;
  files: number;
  chunks: number;
  truncated: boolean;
  total: number;
  failedAt: Date | null;
  failureReason: FailureReason | null;
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
