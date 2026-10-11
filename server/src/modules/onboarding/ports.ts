/**
 * Application-layer ports of the onboarding module. Plain TS: no drizzle,
 * fastify, zod, node:fs or SDK imports. Schema types are type-only imports.
 */
import type { LLMProvider } from '@devdigest/shared';
import type { OnboardingTour } from './schemas.js';

export type LlmProviderId = 'openai' | 'anthropic' | 'openrouter';

export interface ModelChoice {
  provider: LlmProviderId;
  model: string;
}

export interface RepoLocation {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  clonePath: string | null;
}

export interface OnboardingStore {
  /** The repository, or `undefined` when it does not belong to the workspace. */
  getRepo(workspaceId: string, repoId: string): Promise<RepoLocation | undefined>;
  /** The stored tour; a corrupt row reads as `null`. */
  getTour(repoId: string): Promise<OnboardingTour | null>;
  upsertTour(repoId: string, tour: OnboardingTour): Promise<void>;
}

/** What a path in the clone is. `invalid` = symlink, escape or unreadable. */
export type FsKind = 'file' | 'directory' | 'missing' | 'invalid';

export interface RepoFile {
  path: string;
  size: number;
}

export type FileRead =
  | { kind: 'ok'; content: string }
  | { kind: 'missing' | 'too_large' | 'invalid_path' | 'unreadable' };

/** Filesystem access to a repository clone. Implementations must fail closed. */
export interface RepoFiles {
  isDirectory(root: string): Promise<boolean>;
  kind(root: string, relPath: string): Promise<FsKind>;
  /** Regular files (never symlinks), forward-slash relative paths. Null when the root is unreadable. */
  walk(
    root: string,
    excluded: ReadonlySet<string>,
    accept: (relPath: string) => boolean,
  ): Promise<RepoFile[] | null>;
  read(root: string, relPath: string, maxBytes: number): Promise<FileRead>;
  /** Shallow listing; directories end with `/`. Sorted, capped at `max`. */
  listShallow(
    root: string,
    depth: number,
    max: number,
    excluded: ReadonlySet<string>,
  ): Promise<string[]>;
}

/** Structural subset of the repo-intel facade. */
export interface IndexSnapshot {
  status: 'full' | 'partial' | 'degraded' | 'failed';
  filesIndexed: number;
  lastIndexedSha: string;
  degradedReason?: string;
  updatedAt: Date;
}

export interface IndexFacts {
  getIndexState(repoId: string): Promise<IndexSnapshot>;
  getTopFilesByRank(repoId: string, n: number): Promise<string[]>;
  getCriticalPaths(repoId: string): Promise<string[][]>;
}

export interface CloneHead {
  currentHead(owner: string, name: string): Promise<string>;
}

export interface OnboardingLog {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

/** Repo-derived facts handed to the prompt. Env VALUES never appear here. */
export interface RepoFacts {
  fullName: string;
  defaultBranch: string;
  index: { status: string; filesIndexed: number };
  topFiles: string[];
  chains: string[][];
  tree: string[];
  packageScripts: { path: string; scripts: string[] }[];
  composeServices: { path: string; services: string[] }[];
  envNames: string[];
  readme: string;
}

export interface OnboardingDeps {
  store: OnboardingStore;
  files: RepoFiles;
  index: IndexFacts;
  head: CloneHead;
  llm: (provider: LlmProviderId) => Promise<LLMProvider>;
  modelChoice: (workspaceId: string) => Promise<ModelChoice>;
  timeoutMs: number;
  now?: () => Date;
}
