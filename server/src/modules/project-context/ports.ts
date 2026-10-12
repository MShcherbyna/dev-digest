import type { ProjectDoc } from '@devdigest/reviewer-core';
import type { ProjectContextDocEntry } from './types.js';

/** Result of reading one document from a clone. */
export type DocRead =
  | { kind: 'ok'; content: string }
  | { kind: 'missing' | 'too_large' | 'invalid_path' | 'unreadable' };

export interface DocFile {
  path: string;
  size: number;
}

/** Filesystem access to a repository clone. Implementations must fail closed. */
export interface RepoDocsSource {
  /**
   * Regular files under `root` (forward-slash relative paths), never following
   * symlinks and never entering `excluded` directory names at any depth.
   * `accept` is applied before the size lookup. Returns null when the root is
   * missing/unreadable.
   */
  walk(
    root: string,
    excluded: ReadonlySet<string>,
    accept: (relPath: string) => boolean,
  ): Promise<DocFile[] | null>;
  read(root: string, relPath: string, maxBytes: number): Promise<DocRead>;
}

export interface RepoLocation {
  id: string;
  owner: string;
  name: string;
  clonePath: string | null;
}

/** Per-agent rows for "used by": the paths that reach that agent (direct or via an enabled skill). */
export interface UsedByRow {
  agentId: string;
  paths: string[];
}

/**
 * Persistence port. Writes touch only the per-(agent|skill, repo) list tables;
 * no version bump (AC-23). Path getters return `[]` when the pair has no row.
 */
export interface ProjectContextStore {
  getRepo(workspaceId: string, repoId: string): Promise<RepoLocation | undefined>;
  agentExists(workspaceId: string, agentId: string): Promise<boolean>;
  skillExists(workspaceId: string, skillId: string): Promise<boolean>;
  getAgentPaths(agentId: string, repoId: string): Promise<string[]>;
  /** Whole-list replace (upsert). */
  setAgentPaths(agentId: string, repoId: string, paths: string[]): Promise<string[]>;
  getSkillPaths(skillId: string, repoId: string): Promise<string[]>;
  setSkillPaths(skillId: string, repoId: string, paths: string[]): Promise<string[]>;
  /** Rows for this repository's lists only (AC-9). */
  usedByRows(workspaceId: string, repoId: string): Promise<UsedByRow[]>;
  /** Attached paths of the given skills for one repo (run path), keyed by skill id. */
  skillPathsFor(skillIds: string[], repoId: string): Promise<Map<string, string[]>>;
}

export interface ProjectContextLog {
  warn(msg: string): void;
}

export interface ResolveForRunInput {
  workspaceId: string;
  agentId: string;
  /** The PR's repository; only its lists are read (AC-24). */
  repoId: string;
  clonePath: string | null;
  /** Skills that reach the agent's prompt, in prompt order. */
  skills: { id: string; name: string }[];
}

export interface ResolvedProjectContext {
  docs: ProjectDoc[];
  entries: ProjectContextDocEntry[];
}

/** Read model the run executor depends on. */
export interface ProjectContextResolver {
  resolveForRun(
    input: ResolveForRunInput,
    log: (msg: string, data?: unknown) => void,
  ): Promise<ResolvedProjectContext>;
}
