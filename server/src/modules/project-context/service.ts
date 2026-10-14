import { estimateTokens, type ProjectDoc } from '@devdigest/reviewer-core';
import {
  AppError,
  BadRequestError,
  NotFoundError,
  PayloadTooLargeError,
} from '../../platform/errors.js';
import { TimeoutError } from '../../platform/resilience.js';
import { EXCLUDED_DIRS, INDEX_JOB_KIND, MAX_DOC_BYTES } from './constants.js';
import type { ResolvedGlob } from './glob.js';
import { countUsedBy, duplicatesOf, mergeAttachments, underExcludedDir } from './helpers.js';
import { buildIndex, CancelledError } from './indexer.js';
import { validateDocPath } from './paths.js';
import type {
  BriefDocsResolver,
  CloneHead,
  ContextIndexStore,
  IndexJobs,
  ProjectContextLog,
  ProjectContextResolver,
  ProjectContextStore,
  RepoDocsSource,
  ResolveForBriefInput,
  ResolveForRunInput,
  ResolvedProjectContext,
} from './ports.js';
import type {
  ContextFileContent,
  ContextIndexInfo,
  ContextListing,
  ContextPaths,
  FailureReason,
  IndexStateRecord,
  ProjectContextDocEntry,
  ReindexAccepted,
} from './types.js';

const EXCLUDED = new Set<string>(EXCLUDED_DIRS);

export interface ProjectContextDeps {
  store: ProjectContextStore;
  docs: RepoDocsSource;
  glob: ResolvedGlob;
  log: ProjectContextLog;
  index: ContextIndexStore;
  head: CloneHead;
  jobs: IndexJobs;
  now?: () => Date;
}

interface InflightIndex {
  jobId: Promise<string>;
  /** Set when the job timed out: the abandoned build must not write. */
  cancelled: boolean;
}

export class ProjectContextService implements ProjectContextResolver, BriefDocsResolver {
  /** One re-index per repository at a time; shared by the route, listing and clone trigger. */
  private inflight = new Map<string, InflightIndex>();

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

  private indexInfo(repoId: string, state: IndexStateRecord | undefined): ContextIndexInfo {
    return {
      status: this.inflight.has(repoId) ? 'indexing' : (state?.status ?? 'none'),
      indexed_at: state?.indexedAt?.toISOString() ?? null,
      indexed_sha: state?.indexedSha ?? null,
      files: state?.files ?? 0,
      chunks: state?.chunks ?? 0,
      ...(state?.failedAt
        ? {
            failed_at: state.failedAt.toISOString(),
            ...(state.failureReason ? { failure_reason: state.failureReason } : {}),
          }
        : {}),
    };
  }

  /** Served from the persisted index: never walks or reads the clone (AC-13). */
  async discover(workspaceId: string, repoId: string): Promise<ContextListing> {
    const { store, glob, index } = this.deps;
    const repo = await store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    const { state, files } = await index.readListing(repoId);
    const info = this.indexInfo(repoId, state);
    if (!repo.clonePath) {
      return {
        glob: glob.glob,
        cloned: false,
        truncated: false,
        total: 0,
        stale: false,
        index: info,
        files: [],
      };
    }
    const clonePath = repo.clonePath;
    const [usedBy, stale] = await Promise.all([
      store.usedByRows(workspaceId, repoId).then(countUsedBy),
      // No complete index → nothing can be out of date.
      state?.indexedAt != null
        ? this.isStale(state, clonePath, repo.owner, repo.name)
        : Promise.resolve(false),
    ]);
    return {
      glob: glob.glob,
      cloned: true,
      truncated: state?.truncated ?? false,
      total: state?.total ?? 0,
      stale,
      index: info,
      files: files.map((f) => ({
        path: f.path,
        type: f.type,
        size: f.size,
        tokens: f.tokens,
        too_large: f.tooLarge,
        used_by: usedBy.get(f.path) ?? 0,
      })),
    };
  }

  /** Out of date: clone gone, HEAD moved (or unreadable), or the configured glob changed. */
  private async isStale(
    state: IndexStateRecord,
    clonePath: string,
    owner: string,
    name: string,
  ): Promise<boolean> {
    const { docs, head, glob } = this.deps;
    if (state.glob !== glob.glob) return true;
    if (!(await docs.isDirectory(clonePath))) return true;
    try {
      return (await head.currentHead(owner, name)) !== state.indexedSha;
    } catch {
      return true;
    }
  }

  /**
   * Queue a full re-index. 404 unknown/foreign, 409 not cloned, 503 when the
   * job cannot be queued. A second request while one is in flight joins it.
   */
  async requestReindex(workspaceId: string, repoId: string): Promise<ReindexAccepted> {
    const { store, jobs, log } = this.deps;
    const repo = await store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    if (!repo.clonePath) throw new AppError('not_cloned', 'The repository has not been cloned', 409);

    const existing = this.inflight.get(repoId);
    if (existing) return { status: 'accepted', job_id: await existing.jobId };

    // Registered synchronously (no await since the has() check) so concurrent callers merge.
    const enqueued = jobs.enqueue(workspaceId, INDEX_JOB_KIND, { workspaceId, repoId });
    const entry: InflightIndex = {
      cancelled: false,
      jobId: enqueued.then(
        (j) => j.id,
        () => {
          if (this.inflight.get(repoId) === entry) this.inflight.delete(repoId);
          throw new AppError('job_unavailable', 'The re-index job could not be queued', 503);
        },
      ),
    };
    this.inflight.set(repoId, entry);

    const onSettled = (err?: unknown): void => {
      if (err instanceof TimeoutError) {
        entry.cancelled = true;
        this.deps.index
          .recordFailure(repoId, this.now(), 'timeout')
          .catch(() => undefined)
          .finally(() => {
            if (this.inflight.get(repoId) === entry) this.inflight.delete(repoId);
          });
        log.warn('project context index failed: timeout', { repoId });
        return;
      }
      if (this.inflight.get(repoId) === entry) this.inflight.delete(repoId);
    };
    // Rejections are always handled here; the enqueue failure is surfaced via entry.jobId.
    enqueued.then(
      (j) => j.done.then(() => onSettled(), onSettled),
      () => undefined,
    );

    return { status: 'accepted', job_id: await entry.jobId };
  }

  /** Clone follow-up: never throws, so a failed index can't fail the clone job (AC-10). */
  async requestReindexAfterClone(workspaceId: string, repoId: string): Promise<void> {
    try {
      await this.requestReindex(workspaceId, repoId);
    } catch {
      // not cloned / queue unavailable: nothing to do, the user can re-index manually
    }
  }

  registerIndexJobHandler(): void {
    this.deps.jobs.register(INDEX_JOB_KIND, (payload) =>
      this.runIndexJob(payload as { workspaceId: string; repoId: string }),
    );
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private async runIndexJob({
    workspaceId,
    repoId,
  }: {
    workspaceId: string;
    repoId: string;
  }): Promise<void> {
    const { store, docs, glob, index, head, log } = this.deps;
    const entry = this.inflight.get(repoId);
    const cancelled = () => entry?.cancelled === true;
    const t0 = Date.now();

    let failure: FailureReason | undefined;
    try {
      const repo = await store.getRepo(workspaceId, repoId);
      if (!repo) return; // repository deleted meanwhile
      if (!repo.clonePath) {
        failure = 'clone_missing';
      } else {
        let sha: string | undefined;
        try {
          sha = await head.currentHead(repo.owner, repo.name);
        } catch {
          failure = 'clone_missing';
        }
        if (sha !== undefined) {
          const build = await buildIndex(
            { docs, glob },
            { clonePath: repo.clonePath, indexedSha: sha },
            cancelled,
          );
          if (!build) {
            failure = 'clone_missing';
          } else {
            await index.replaceIndex(repoId, build, this.now(), () => {
              if (cancelled()) throw new CancelledError();
            });
            const chunks = build.files.reduce((n, f) => n + f.chunks.length, 0);
            log.info(
              `project context index: ${build.files.length} files, ${chunks} chunks, ${Date.now() - t0} ms, sha ${sha}`,
            );
            return;
          }
        }
      }
    } catch (err) {
      if (err instanceof CancelledError) return; // the timeout was already recorded
      failure = 'internal_error';
    }
    if (failure === undefined || cancelled()) return;

    try {
      await index.recordFailure(repoId, this.now(), failure);
    } catch {
      // e.g. the repository was deleted meanwhile (FK): nothing left to record
    }
    log.warn(`project context index failed: ${failure}`, { repoId });
    // A plain Error has no status/code, so JobRunner does not retry it; the jobs row ends `failed`.
    throw new Error(`project context index failed: ${failure}`);
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

  /** 404 unless the agent, then the repository, belong to the workspace (before any read/write). */
  private async assertAgentRepo(workspaceId: string, agentId: string, repoId: string): Promise<void> {
    const { store } = this.deps;
    if (!(await store.agentExists(workspaceId, agentId))) throw new NotFoundError('Agent not found');
    if (!(await store.getRepo(workspaceId, repoId))) throw new NotFoundError('Repository not found');
  }

  private async assertSkillRepo(workspaceId: string, skillId: string, repoId: string): Promise<void> {
    const { store } = this.deps;
    if (!(await store.skillExists(workspaceId, skillId))) throw new NotFoundError('Skill not found');
    if (!(await store.getRepo(workspaceId, repoId))) throw new NotFoundError('Repository not found');
  }

  async getAgentContext(workspaceId: string, agentId: string, repoId: string): Promise<ContextPaths> {
    await this.assertAgentRepo(workspaceId, agentId, repoId);
    return { paths: await this.deps.store.getAgentPaths(agentId, repoId) };
  }

  /**
   * Stores the whole ordered list for this (agent, repo) pair (last write wins);
   * never bumps versions (AC-23). 404 checks run before path validation so a
   * foreign id never leaks validation details; nothing is written on any error.
   */
  async setAgentContext(
    workspaceId: string,
    agentId: string,
    repoId: string,
    body: ContextPaths,
  ): Promise<ContextPaths> {
    await this.assertAgentRepo(workspaceId, agentId, repoId);
    this.validatePaths(body.paths);
    return { paths: await this.deps.store.setAgentPaths(agentId, repoId, body.paths) };
  }

  async getSkillContext(workspaceId: string, skillId: string, repoId: string): Promise<ContextPaths> {
    await this.assertSkillRepo(workspaceId, skillId, repoId);
    return { paths: await this.deps.store.getSkillPaths(skillId, repoId) };
  }

  async setSkillContext(
    workspaceId: string,
    skillId: string,
    repoId: string,
    body: ContextPaths,
  ): Promise<ContextPaths> {
    await this.assertSkillRepo(workspaceId, skillId, repoId);
    this.validatePaths(body.paths);
    return { paths: await this.deps.store.setSkillPaths(skillId, repoId, body.paths) };
  }

  /** Never throws for a bad document (AC-24/25/28): skips and records the reason. */
  async resolveForRun(
    input: ResolveForRunInput,
    log: (msg: string, data?: unknown) => void,
  ): Promise<ResolvedProjectContext> {
    const { store, docs } = this.deps;
    // Only the PR repository's lists are read (AC-24).
    const agentPaths = await store.getAgentPaths(input.agentId, input.repoId);
    const skillPaths = await store.skillPathsFor(
      input.skills.map((s) => s.id),
      input.repoId,
    );
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

  /**
   * Documents attached (to any agent or skill) for this repository, deduped and
   * sorted by path, fitted into `budgetTokens`. Never throws for a bad
   * document: invalid, missing, unreadable and empty ones are skipped silently.
   */
  async resolveForBrief(
    input: ResolveForBriefInput,
  ): Promise<{ docs: { path: string; content: string }[]; paths: string[] }> {
    const { store, docs } = this.deps;
    if (!input.clonePath) return { docs: [], paths: [] };
    const rows = await store.usedByRows(input.workspaceId, input.repoId);
    const unique = [...new Set(rows.flatMap((r) => r.paths))].sort();

    const out: { path: string; content: string }[] = [];
    let remaining = input.budgetTokens;
    for (const path of unique) {
      if (!validateDocPath(path).ok) continue;
      const r = await docs.read(input.clonePath, path, MAX_DOC_BYTES);
      if (r.kind !== 'ok' || r.content.trim().length === 0) continue;
      const available = remaining - input.perDocOverheadTokens;
      const cost = estimateTokens(r.content);
      if (cost <= available) {
        out.push({ path, content: r.content });
        remaining -= cost + input.perDocOverheadTokens;
        continue;
      }
      // Over budget: cut this last document if enough room is left, else skip it and stop.
      if (available >= input.minDocTokens) out.push({ path, content: r.content.slice(0, available * 4) });
      break;
    }
    return { docs: out, paths: out.map((d) => d.path) };
  }
}
