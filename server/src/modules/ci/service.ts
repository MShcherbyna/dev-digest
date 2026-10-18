import type {
  CiExport,
  CiExportInput,
  CiInstallBlock,
  CiInstallation,
  CiPreview,
  CiPreviewInput,
  CiRemoveResult,
  CiRun,
  CiRunsQuery,
  CiSecretStatus,
} from '@devdigest/shared';
import { AppError, ConfigError, NotFoundError } from '../../platform/errors.js';
import {
  CI_BRANCH,
  GITHUB_TOKEN_SECRET,
  MAX_FILE_BYTES,
  MEMORY_PATH,
  OPENROUTER_SECRET,
  PR_TITLE_ADD,
  PR_TITLE_REMOVE,
  PR_TITLE_UPDATE,
  RUNNER_PATH,
  WORKFLOW_PATH,
  agentManifestPath,
  skillPath,
} from './constants.js';
import { findSecret } from './domain/secrets.js';
import { deriveStatus } from './domain/status.js';
import { buildFileBundle, withWorkflow, type FileBundle } from './generator/files.js';
import { mergeWorkflow, removeAgentJob, validateWorkflow } from './generator/workflow.js';
import {
  CiGitHubError,
  type AgentSource,
  type BranchHead,
  type CiAgent,
  type CiGitHub,
  type CiLog,
  type CiPr,
  type CiStore,
  type InstallationRecord,
  type RepoRecord,
  type RunnerBundle,
} from './ports.js';

export interface CiServiceDeps {
  store: CiStore;
  agents: AgentSource;
  /** Throws `ConfigError` when no GitHub token is configured. */
  github: () => Promise<CiGitHub>;
  bundle: RunnerBundle;
}

interface Head {
  head: BranchHead;
  /** true = `devdigest/ci` does not exist yet and is created from the default branch. */
  createBranch: boolean;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function toInstallation(r: InstallationRecord): CiInstallation {
  return {
    id: r.id,
    agent_id: r.agentId,
    repo: r.repo,
    target_type: r.targetType,
    installed_at: r.installedAt.toISOString(),
    agent_slug: r.agentSlug,
    mode: r.mode,
    status: deriveStatus({
      removalPrUrl: r.removalPrUrl,
      agentVersion: r.agentVersion,
      manifestVersion: r.manifestVersion,
      lastRunAt: r.lastRunAt,
    }),
    manifest_version: r.manifestVersion,
    post_as: r.postAs,
    triggers: r.triggers,
    pr_url: r.prUrl,
    removal_pr_url: r.removalPrUrl,
    last_run_at: iso(r.lastRunAt),
    last_run_status: r.lastRunStatus,
  };
}

/** AC-16 / AC-36: permission -> 403 naming the permission; anything else from GitHub -> 502. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof CiGitHubError) {
    if (err.kind === 'permission') {
      const permission = err.permission === 'actions' || !err.permission ? 'contents' : err.permission;
      return new AppError('github_permission', err.message, 403, { permission });
    }
    return new AppError('github_error', err.message, 502, { kind: err.kind });
  }
  return new AppError('github_error', 'GitHub request failed', 502);
}

export class CiService {
  constructor(private deps: CiServiceDeps) {}

  // ------------------------------------------------------------ preview

  async preview(workspaceId: string, agentId: string, input: CiPreviewInput): Promise<CiPreview> {
    this.assertTarget(input.target);
    const { agent, repo } = await this.load(workspaceId, agentId, input.repo);
    const bundle = await this.buildBundle(workspaceId, agent, repo);
    const remote = await this.remoteState(repo);

    let workflow: string;
    try {
      workflow = mergeWorkflow(remote.workflow, bundle.agentSlug, input.triggers, input.post_as);
    } catch (err) {
      // A broken file in the repo must not break Preview; Install reports it.
      if (!(err instanceof AppError) || err.code !== 'workflow_invalid') throw err;
      workflow = mergeWorkflow(null, bundle.agentSlug, input.triggers, input.post_as);
    }

    const installations = await this.deps.store.listInstallationsByRepo(workspaceId, repo.fullName);
    return {
      files: withWorkflow(bundle, workflow),
      secrets: [
        { name: OPENROUTER_SECRET, status: remote.secret },
        { name: GITHUB_TOKEN_SECRET, status: 'ready' },
      ],
      notes: bundle.openrouterId ? [{ kind: 'openrouter_id', id: bundle.openrouterId }] : [],
      agent_slug: bundle.agentSlug,
      manifest_version: bundle.manifestVersion,
      install_block: this.installBlock(installations, agent.id, bundle.agentSlug),
      pr_open: remote.prOpen,
    };
  }

  // ------------------------------------------------------------ export

  async exportCi(workspaceId: string, agentId: string, input: CiExportInput, log: CiLog): Promise<CiExport> {
    const counters = { files: 0, prUrl: null as string | null };
    try {
      const result = await this.doExport(workspaceId, agentId, input, counters);
      log.info({ agentId, repo: input.repo, mode: input.mode, files: counters.files, outcome: 'ok', prUrl: counters.prUrl }, 'ci export');
      return result;
    } catch (err) {
      const code = err instanceof AppError ? err.code : 'unexpected';
      log.warn({ agentId, repo: input.repo, mode: input.mode, files: counters.files, outcome: code, prUrl: null }, 'ci export');
      throw err;
    }
  }

  private async doExport(
    workspaceId: string,
    agentId: string,
    input: CiExportInput,
    counters: { files: number; prUrl: string | null },
  ): Promise<CiExport> {
    this.assertTarget(input.target);
    const { agent, repo } = await this.load(workspaceId, agentId, input.repo);
    const bundle = await this.buildBundle(workspaceId, agent, repo);
    const slug = bundle.agentSlug;

    const inRepo = await this.deps.store.listInstallationsByRepo(workspaceId, repo.fullName);
    const block = this.installBlock(inRepo, agent.id, slug);
    if (block === 'agent_slug_conflict') {
      throw new AppError('agent_slug_conflict', 'Another agent in this repository already uses this slug; rename the agent', 409);
    }
    if (block === 'multi_agent_unsupported') {
      throw new AppError('multi_agent_unsupported', 'Multi-agent CI support is not available yet', 409);
    }

    let gh: CiGitHub | undefined;
    let target: Head | undefined;
    const connect = async () => {
      gh = await this.githubOrThrow();
      target = await this.guard(() => this.resolveHead(gh!, repo));
    };

    let workflow = input.workflow ?? null;
    if (workflow === null) {
      let existing: string | null = null;
      if (input.mode === 'pr') {
        await connect();
        existing = await this.guard(() => gh!.readFile(repo.fullName, target!.head.commitSha, WORKFLOW_PATH));
      }
      workflow = mergeWorkflow(existing, slug, input.triggers, input.post_as);
    }
    validateWorkflow(workflow);

    const files = withWorkflow(bundle, workflow);
    counters.files = files.length;
    const tooLarge = files.find((f) => Buffer.byteLength(f.contents, 'utf8') > MAX_FILE_BYTES);
    if (tooLarge) {
      throw new AppError('file_too_large', 'A generated file is larger than 5 MB', 422, { path: tooLarge.path });
    }
    // The runner bundle is server-controlled and minified; scan only what a user can influence.
    const secretPath = findSecret(files.filter((f) => f.path !== RUNNER_PATH));
    if (secretPath) {
      throw new AppError('secret_in_export', 'A file to export looks like it contains a secret', 422, { path: secretPath });
    }

    const base = {
      agentId: agent.id,
      repo: repo.fullName,
      agentSlug: slug,
      manifestVersion: bundle.manifestVersion,
      postAs: input.post_as,
      triggers: input.triggers,
      skillSlugs: bundle.skillSlugs,
    };

    if (input.mode === 'manual') {
      const installation = await this.deps.store.upsertInstallation(workspaceId, { ...base, mode: 'manual', prUrl: null });
      return { installation: toInstallation(installation), files, pr_url: null };
    }

    if (!gh || !target) await connect();
    const exists = inRepo.some((i) => i.agentId === agent.id);
    const title = exists ? PR_TITLE_UPDATE : PR_TITLE_ADD;
    const pr = await this.guard(async () => {
      await gh!.commit(repo.fullName, {
        branch: CI_BRANCH,
        parent: target!.head,
        createBranch: target!.createBranch,
        message: title,
        upserts: files.map((f) => ({ path: f.path, contents: f.contents })),
        deletes: [],
      });
      return this.findOrOpenPr(gh!, repo, target!, title, `DevDigest CI review for agent "${agent.name}".`);
    });
    counters.prUrl = pr.url;

    // Recorded only after the PR exists: a GitHub failure leaves the installation untouched (AC-16).
    const installation = await this.deps.store.upsertInstallation(workspaceId, { ...base, mode: 'pr', prUrl: pr.url });
    return { installation: toInstallation(installation), files, pr_url: pr.url };
  }

  // ------------------------------------------------------------ remove

  async remove(workspaceId: string, installationId: string, log: CiLog): Promise<CiRemoveResult> {
    const inst = await this.deps.store.getInstallation(workspaceId, installationId);
    if (!inst) throw new NotFoundError('Installation not found');
    let files = 0;
    let prUrl: string | null = null;
    try {
      const repo = await this.deps.store.repoForWorkspace(workspaceId, inst.repo);
      if (!repo) throw new AppError('repo_not_connected', 'The repository is not connected to this workspace', 422);
      const gh = await this.githubOrThrow();
      const target = await this.guard(() => this.resolveHead(gh, repo));
      const others = (await this.deps.store.listInstallationsByRepo(workspaceId, inst.repo)).filter((i) => i.id !== inst.id);

      const pr = await this.guard(async () => {
        const tree = await gh.listTreePaths(repo.fullName, target.head.treeSha);
        const deletes: string[] = [];
        const upserts: { path: string; contents: string }[] = [];
        const del = (path: string) => {
          if (tree.has(path)) deletes.push(path);
        };

        del(agentManifestPath(inst.agentSlug));
        const keptByOthers = new Set(others.flatMap((o) => o.skillSlugs));
        for (const s of inst.skillSlugs) if (!keptByOthers.has(s)) del(skillPath(s));

        if (others.length === 0) {
          del(MEMORY_PATH);
          del(RUNNER_PATH);
          del(WORKFLOW_PATH);
        } else if (tree.has(WORKFLOW_PATH)) {
          const text = await gh.readFile(repo.fullName, target.head.commitSha, WORKFLOW_PATH);
          if (text !== null) {
            const next = removeAgentJob(text, inst.agentSlug);
            if (next === null) deletes.push(WORKFLOW_PATH);
            else if (next !== text) upserts.push({ path: WORKFLOW_PATH, contents: next });
          }
        }
        files = deletes.length + upserts.length;
        // Nothing to delete -> an empty commit still lets the removal go through a PR (D-8).
        await gh.commit(repo.fullName, {
          branch: CI_BRANCH,
          parent: target.head,
          createBranch: target.createBranch,
          message: PR_TITLE_REMOVE,
          upserts,
          deletes,
        });
        return this.findOrOpenPr(gh, repo, target, PR_TITLE_REMOVE, `Removes the DevDigest CI files of agent "${inst.agentName}".`);
      });
      prUrl = pr.url;

      await this.deps.store.setRemovalPr(inst.id, pr.url);
      const updated = await this.deps.store.getInstallation(workspaceId, inst.id);
      log.info({ agentId: inst.agentId, repo: inst.repo, mode: 'remove', files, outcome: 'ok', prUrl }, 'ci remove');
      return { installation: updated ? toInstallation(updated) : null, pr_url: pr.url };
    } catch (err) {
      const code = err instanceof AppError ? err.code : 'unexpected';
      log.warn({ agentId: inst.agentId, repo: inst.repo, mode: 'remove', files, outcome: code, prUrl: null }, 'ci remove');
      throw err;
    }
  }

  // ------------------------------------------------------------ reads

  async listInstallations(workspaceId: string, agentId: string): Promise<CiInstallation[]> {
    if (!(await this.deps.agents.get(workspaceId, agentId))) throw new NotFoundError('Agent not found');
    return (await this.deps.store.listInstallationsByAgent(workspaceId, agentId)).map(toInstallation);
  }

  listRuns(workspaceId: string, query: CiRunsQuery): Promise<CiRun[]> {
    return this.deps.store.listRuns(workspaceId, query);
  }

  // ------------------------------------------------------------ helpers

  private assertTarget(target: string): void {
    if (target !== 'gha') {
      throw new AppError('target_not_supported', 'Only GitHub Actions is supported', 422, { target });
    }
  }

  private async load(workspaceId: string, agentId: string, repoName: string): Promise<{ agent: CiAgent; repo: RepoRecord }> {
    const agent = await this.deps.agents.get(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const repo = await this.deps.store.repoForWorkspace(workspaceId, repoName);
    if (!repo) throw new AppError('repo_not_connected', 'The repository is not connected to this workspace', 422);
    return { agent, repo };
  }

  private async buildBundle(workspaceId: string, agent: CiAgent, repo: RepoRecord): Promise<FileBundle> {
    const [skills, memory, runner] = await Promise.all([
      this.deps.agents.enabledSkills(agent.id),
      this.deps.store.memoryForExport(workspaceId, repo.id),
      this.deps.bundle.read(),
    ]);
    return buildFileBundle({ agent, skills, memory, runner });
  }

  /** AC-31 / AC-32, from the database only (no GitHub call). */
  private installBlock(installations: InstallationRecord[], agentId: string, slug: string): CiInstallBlock | null {
    const others = installations.filter((i) => i.agentId !== agentId);
    if (others.some((i) => i.agentSlug === slug)) return 'agent_slug_conflict';
    if (others.length > 0) return 'multi_agent_unsupported';
    return null;
  }

  /** Preview never fails because of GitHub: every probe degrades independently. */
  private async remoteState(repo: RepoRecord): Promise<{ workflow: string | null; secret: CiSecretStatus; prOpen: boolean }> {
    let gh: CiGitHub;
    try {
      gh = await this.deps.github();
    } catch {
      return { workflow: null, secret: 'unknown', prOpen: false };
    }
    const [workflow, secret, pr] = await Promise.all([
      this.resolveHead(gh, repo)
        .then((t) => gh.readFile(repo.fullName, t.head.commitSha, WORKFLOW_PATH))
        .catch(() => null),
      gh.secretStatus(repo.fullName, OPENROUTER_SECRET).catch((): CiSecretStatus => 'unknown'),
      gh.findOpenPr(repo.fullName, CI_BRANCH).catch(() => null),
    ]);
    return { workflow, secret, prOpen: pr !== null };
  }

  private async githubOrThrow(): Promise<CiGitHub> {
    try {
      return await this.deps.github();
    } catch (err) {
      if (err instanceof ConfigError) {
        throw new AppError('github_token_missing', 'Add a GitHub token in Settings', 422);
      }
      throw toAppError(err);
    }
  }

  /** `devdigest/ci` when it exists, else the default branch (the branch is then created). */
  private async resolveHead(gh: CiGitHub, repo: RepoRecord): Promise<Head> {
    const onBranch = await gh.getBranchHead(repo.fullName, CI_BRANCH);
    if (onBranch) return { head: onBranch, createBranch: false };
    const onDefault = await gh.getBranchHead(repo.fullName, repo.defaultBranch);
    if (!onDefault) throw new CiGitHubError('unexpected', 'The default branch was not found on GitHub');
    return { head: onDefault, createBranch: true };
  }

  /** Reuse the open PR from `devdigest/ci`, otherwise open one (a new branch cannot have a PR yet). */
  private async findOrOpenPr(gh: CiGitHub, repo: RepoRecord, target: Head, title: string, body: string): Promise<CiPr> {
    if (!target.createBranch) {
      const open = await gh.findOpenPr(repo.fullName, CI_BRANCH);
      if (open) return open;
    }
    return gh.openPr(repo.fullName, { title, head: CI_BRANCH, base: repo.defaultBranch, body });
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw toAppError(err);
    }
  }
}
