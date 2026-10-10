import { estimateTokens, type ProjectDoc } from '@devdigest/reviewer-core';
import { BadRequestError, NotFoundError, PayloadTooLargeError } from '../../platform/errors.js';
import { EXCLUDED_DIRS, MAX_DOC_BYTES, READ_CONCURRENCY } from './constants.js';
import type { ResolvedGlob } from './glob.js';
import {
  capAndSort,
  countUsedBy,
  docTypeOf,
  duplicatesOf,
  mergeAttachments,
  tokensFor,
  underExcludedDir,
} from './helpers.js';
import { validateDocPath } from './paths.js';
import type {
  ProjectContextLog,
  ProjectContextResolver,
  ProjectContextStore,
  RepoDocsSource,
  ResolveForRunInput,
  ResolvedProjectContext,
} from './ports.js';
import type {
  ContextFileContent,
  ContextListing,
  ContextPaths,
  ProjectContextDocEntry,
} from './types.js';

const EXCLUDED = new Set<string>(EXCLUDED_DIRS);

export interface ProjectContextDeps {
  store: ProjectContextStore;
  docs: RepoDocsSource;
  glob: ResolvedGlob;
  log: ProjectContextLog;
}

/** Run `fn` over `items` with at most `limit` in flight, preserving order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export class ProjectContextService implements ProjectContextResolver {
  constructor(private deps: ProjectContextDeps) {
    // AC-3: the rejected configured glob is logged once, when the service is built.
    if (deps.glob.rejected !== undefined) {
      deps.log.warn(
        `project context: invalid PROJECT_CONTEXT_GLOB ${JSON.stringify(deps.glob.rejected)}; using default ${deps.glob.glob}`,
      );
    }
  }

  /** Is `path` something discovery would list (glob match, not under an excluded dir)? */
  private isDiscoverable(path: string): boolean {
    return this.deps.glob.regex.test(path) && !underExcludedDir(path, EXCLUDED);
  }

  async discover(workspaceId: string, repoId: string): Promise<ContextListing> {
    const { store, docs, glob } = this.deps;
    const repo = await store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    const scannedAt = new Date().toISOString();
    const empty = {
      glob: glob.glob,
      scanned_at: scannedAt,
      cloned: false,
      truncated: false,
      total: 0,
      files: [],
    };
    if (!repo.clonePath) return empty;
    const found = await docs.walk(
      repo.clonePath,
      EXCLUDED,
      // Paths with quotes/control chars are dropped so they can never become a prompt label.
      (p) => glob.regex.test(p) && validateDocPath(p).ok,
    );
    if (!found) return empty;

    const { files, truncated, total } = capAndSort(found);
    const clonePath = repo.clonePath;
    const [usedBy, tokens] = await Promise.all([
      store.usedByRows(workspaceId).then(countUsedBy),
      mapPool(files, READ_CONCURRENCY, async (f) => {
        if (f.size > MAX_DOC_BYTES) return tokensFor(f.size);
        const r = await docs.read(clonePath, f.path, MAX_DOC_BYTES);
        return r.kind === 'ok' ? tokensFor(f.size, r.content) : tokensFor(f.size);
      }),
    ]);
    return {
      glob: glob.glob,
      scanned_at: scannedAt,
      cloned: true,
      truncated,
      total,
      files: files.map((f, i) => ({
        path: f.path,
        type: docTypeOf(f.path),
        size: f.size,
        tokens: tokens[i]!,
        too_large: f.size > MAX_DOC_BYTES,
        used_by: usedBy.get(f.path) ?? 0,
      })),
    };
  }

  async readFile(workspaceId: string, repoId: string, path: string): Promise<ContextFileContent> {
    const { store, docs } = this.deps;
    if (!validateDocPath(path).ok) throw new BadRequestError('Invalid document path');
    const repo = await store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    // Serve only what discovery would list: no route can read arbitrary clone files (.env, …).
    if (!repo.clonePath || !this.isDiscoverable(path)) throw new NotFoundError('Document not found');
    const r = await docs.read(repo.clonePath, path, MAX_DOC_BYTES);
    switch (r.kind) {
      case 'ok':
        return {
          path,
          content: r.content,
          size: Buffer.byteLength(r.content, 'utf8'),
          tokens: estimateTokens(r.content),
        };
      case 'too_large':
        throw new PayloadTooLargeError('Document is too large to preview');
      case 'invalid_path':
        throw new BadRequestError('Invalid document path');
      default:
        throw new NotFoundError('Document not found');
    }
  }

  private validatePaths(paths: string[]): void {
    const invalid = paths.filter((p) => !validateDocPath(p).ok);
    const duplicates = duplicatesOf(paths);
    if (invalid.length > 0 || duplicates.length > 0) {
      throw new BadRequestError('Invalid context paths', { invalid, duplicates });
    }
  }

  async getAgentContext(workspaceId: string, agentId: string): Promise<ContextPaths> {
    const paths = await this.deps.store.getAgentPaths(workspaceId, agentId);
    if (!paths) throw new NotFoundError('Agent not found');
    return { paths };
  }

  /** Stores the whole ordered list (last write wins); never bumps versions (AC-23). */
  async setAgentContext(workspaceId: string, agentId: string, body: ContextPaths): Promise<ContextPaths> {
    this.validatePaths(body.paths);
    const paths = await this.deps.store.setAgentPaths(workspaceId, agentId, body.paths);
    if (!paths) throw new NotFoundError('Agent not found');
    return { paths };
  }

  async getSkillContext(workspaceId: string, skillId: string): Promise<ContextPaths> {
    const paths = await this.deps.store.getSkillPaths(workspaceId, skillId);
    if (!paths) throw new NotFoundError('Skill not found');
    return { paths };
  }

  async setSkillContext(workspaceId: string, skillId: string, body: ContextPaths): Promise<ContextPaths> {
    this.validatePaths(body.paths);
    const paths = await this.deps.store.setSkillPaths(workspaceId, skillId, body.paths);
    if (!paths) throw new NotFoundError('Skill not found');
    return { paths };
  }

  /** Never throws for a bad document (AC-24/25/28): skips and records the reason. */
  async resolveForRun(
    input: ResolveForRunInput,
    log: (msg: string, data?: unknown) => void,
  ): Promise<ResolvedProjectContext> {
    const { store, docs } = this.deps;
    const agentPaths = (await store.getAgentPaths(input.workspaceId, input.agentId)) ?? [];
    const skillPaths = await store.skillPathsFor(input.skills.map((s) => s.id));
    const merged = mergeAttachments(
      agentPaths,
      input.skills.map((s) => ({ name: s.name, paths: skillPaths.get(s.id) ?? [] })),
    );

    const entries: ProjectContextDocEntry[] = [];
    const included: ProjectDoc[] = [];
    for (const m of merged) {
      const base = {
        path: m.path,
        origin: m.origin,
        ...(m.skill !== undefined ? { skill: m.skill } : {}),
      };
      const skip = (reason: NonNullable<ProjectContextDocEntry['reason']>) =>
        entries.push({ ...base, status: 'skipped', reason });

      if (!validateDocPath(m.path).ok) {
        skip('invalid_path');
        continue;
      }
      if (!input.clonePath) {
        skip('missing');
        continue;
      }
      const r = await docs.read(input.clonePath, m.path, MAX_DOC_BYTES);
      if (r.kind !== 'ok') {
        skip(r.kind);
        continue;
      }
      if (r.content.trim().length === 0) {
        skip('empty');
        continue;
      }
      included.push({ path: m.path, content: r.content });
      entries.push({ ...base, status: 'included', tokens: estimateTokens(r.content) });
    }

    const skipped = entries.filter((e) => e.status === 'skipped');
    log(`project context: ${included.length} included, ${skipped.length} skipped`);
    for (const e of skipped) log(`project context: skipped ${e.path} (${e.reason})`);
    return { docs: included, entries };
  }
}
