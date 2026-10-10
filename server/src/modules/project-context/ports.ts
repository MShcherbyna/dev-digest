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

/** Persistence port. Writes touch only `context_paths` (no version bump, AC-23). */
export interface ProjectContextStore {
  getRepo(workspaceId: string, repoId: string): Promise<RepoLocation | undefined>;
  getAgentPaths(workspaceId: string, agentId: string): Promise<string[] | undefined>;
  setAgentPaths(workspaceId: string, agentId: string, paths: string[]): Promise<string[] | undefined>;
  getSkillPaths(workspaceId: string, skillId: string): Promise<string[] | undefined>;
  setSkillPaths(workspaceId: string, skillId: string, paths: string[]): Promise<string[] | undefined>;
  usedByRows(workspaceId: string): Promise<UsedByRow[]>;
  /** Attached paths of the given skills (run path), keyed by skill id. */
  skillPathsFor(skillIds: string[]): Promise<Map<string, string[]>>;
}

export interface ProjectContextLog {
  warn(msg: string): void;
}

export interface ResolveForRunInput {
  workspaceId: string;
  agentId: string;
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
