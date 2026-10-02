import type { BlastRadius, PrHistory } from '@devdigest/shared';
import type { RepoIntel } from '../repo-intel/index.js';

/**
 * Blast-radius application ports. Plain TS only: no fastify, drizzle or zod.
 * Infrastructure (repository.ts, sources.ts) implements these; the composition
 * root (platform/container.ts) wires them.
 */

export type BlastReason =
  | 'flag_off'
  | 'index_failed'
  | 'index_partial'
  | 'repo_too_large'
  | 'no_data'
  | 'no_changed_files';

export interface BlastPull {
  prId: string;
  repoId: string;
  number: number;
  headSha: string;
  /** Base branch name (history is read from here). */
  base: string;
  repo: { owner: string; name: string };
}

/** Persisted PR facts the blast read needs. */
export interface BlastPullReader {
  getPull(workspaceId: string, prId: string): Promise<BlastPull | undefined>;
  listChangedPaths(prId: string): Promise<string[]>;
}

/** Fallback for a PR whose files were never persisted. Never throws; `[]` when unavailable. */
export interface BlastRemoteFiles {
  listChangedPaths(pull: BlastPull): Promise<string[]>;
}

/** The only repo-intel surface this module reads (via the container facade). */
export type BlastIntel = Pick<RepoIntel, 'getBlastRadius' | 'getIndexState'>;

/** Wire shape: the shared `BlastRadius` plus honest degradation info. */
export type BlastRadiusView = BlastRadius & {
  degraded: boolean;
  reason: BlastReason | null;
  /** Commit the index (and so every caller line) was built from; null when unknown. */
  ref_sha: string | null;
};

export interface BlastReader {
  get(workspaceId: string, prId: string): Promise<BlastRadiusView>;
}

// ---- Prior PRs (history) ---------------------------------------------------

export interface PriorPrQuery {
  repo: { owner: string; name: string };
  ref: string;
  paths: string[];
}

export interface PriorPrHit {
  number: number;
  title: string;
  mergedAt: string | null;
  author: string;
  body: string;
  /** The queried changed path this PR touched. */
  path: string;
}

/** May throw (no token, network, deadline). The service turns any failure into `available:false`. */
export interface PriorPrSource {
  listForPaths(q: PriorPrQuery): Promise<PriorPrHit[]>;
}

export type PriorPrsView = PrHistory & { available: boolean };

export interface BlastHistoryReader {
  history(workspaceId: string, prId: string): Promise<PriorPrsView>;
}
