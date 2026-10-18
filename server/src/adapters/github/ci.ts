import { Octokit } from 'octokit';
import { unzipSync } from 'fflate';
import type { CiSecretStatus } from '@devdigest/shared';
import { TimeoutError, withRetry, withTimeout } from '../../platform/resilience.js';
import {
  CiGitHubError,
  type BranchHead,
  type CiArtifactDownload,
  type CiArtifactRef,
  type CiCommitInput,
  type CiGitHub,
  type CiGitHubPermission,
  type CiPr,
  type CiPrState,
  type CiWorkflowRun,
} from '../../modules/ci/ports.js';

const TIMEOUT = 30_000;
/** Artifact download follows a redirect and unzips: allow more time than a JSON call. */
const DOWNLOAD_TIMEOUT = 60_000;

type Area = 'git' | 'pulls' | 'actions';

const AREA_PERMISSION: Record<Area, CiGitHubPermission> = {
  git: 'contents',
  pulls: 'pull_requests',
  actions: 'actions',
};

function split(repo: string): { owner: string; repo: string } {
  const [owner, name] = repo.split('/');
  if (!owner || !name) throw new CiGitHubError('unexpected', 'Invalid repository name');
  return { owner, repo: name };
}

function statusOf(err: unknown): number | undefined {
  const s = (err as { status?: unknown })?.status;
  return typeof s === 'number' ? s : undefined;
}

function isRateLimited(err: unknown, status: number | undefined): boolean {
  if (status !== 403 && status !== 429) return false;
  const headers = (err as { response?: { headers?: Record<string, string | undefined> } })?.response?.headers ?? {};
  const message = String((err as { message?: unknown })?.message ?? '').toLowerCase();
  return (
    status === 429 ||
    headers['x-ratelimit-remaining'] === '0' ||
    headers['retry-after'] !== undefined ||
    message.includes('rate limit')
  );
}

/**
 * Map an Octokit failure to our taxonomy (AC-16, AC-24). `write` calls turn 403/404
 * into `permission` (fine-grained PATs answer 404 for a missing permission); the
 * named permission comes from the failing call's area, or `workflows` when GitHub
 * says so. SDK errors never leave this file.
 */
export function classify(err: unknown, area: Area, write: boolean): CiGitHubError {
  if (err instanceof CiGitHubError) return err;
  if (err instanceof TimeoutError) return new CiGitHubError('network', 'GitHub request timed out');
  const status = statusOf(err);
  if (status === undefined) return new CiGitHubError('network', 'Could not reach GitHub');
  if (status === 401) return new CiGitHubError('auth', 'GitHub rejected the token');
  if (isRateLimited(err, status)) return new CiGitHubError('rate_limited', 'GitHub rate limit reached');
  const message = String((err as { message?: unknown })?.message ?? '').toLowerCase();
  if (message.includes('workflow') && (status === 403 || status === 404 || status === 422)) {
    return new CiGitHubError('permission', 'The GitHub token cannot write workflow files', 'workflows');
  }
  if (status === 403 || (write && status === 404)) {
    return new CiGitHubError('permission', 'The GitHub token lacks a required permission', AREA_PERMISSION[area]);
  }
  return new CiGitHubError('unexpected', `GitHub returned ${status}`);
}

/** CiGitHub over Octokit REST. Reads retry on transient failures; writes never retry. */
export class OctokitCiGitHub implements CiGitHub {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  private raw<T>(fn: () => Promise<T>, timeoutMs = TIMEOUT): Promise<T> {
    return withRetry(() => withTimeout(fn(), timeoutMs));
  }

  private async read<T>(area: Area, fn: () => Promise<T>): Promise<T> {
    try {
      return await this.raw(fn);
    } catch (err) {
      throw classify(err, area, false);
    }
  }

  private async write<T>(area: Area, fn: () => Promise<T>): Promise<T> {
    try {
      return await withTimeout(fn(), TIMEOUT);
    } catch (err) {
      throw classify(err, area, true);
    }
  }

  /** A read where 404 is an expected "absent" answer. */
  private async readOrNull<T>(area: Area, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await this.raw(fn);
    } catch (err) {
      if (statusOf(err) === 404) return null;
      throw classify(err, area, false);
    }
  }

  async getBranchHead(repo: string, branch: string): Promise<BranchHead | null> {
    const r = split(repo);
    const res = await this.readOrNull('git', () => this.octokit.rest.repos.getBranch({ ...r, branch }));
    if (!res) return null;
    return { commitSha: res.data.commit.sha, treeSha: res.data.commit.commit.tree.sha };
  }

  async listTreePaths(repo: string, treeSha: string): Promise<Set<string>> {
    const r = split(repo);
    const res = await this.read('git', () =>
      this.octokit.rest.git.getTree({ ...r, tree_sha: treeSha, recursive: 'true' }),
    );
    return new Set(res.data.tree.filter((e) => e.type === 'blob' && e.path).map((e) => e.path as string));
  }

  async readFile(repo: string, ref: string, path: string): Promise<string | null> {
    const r = split(repo);
    const res = await this.readOrNull('git', () => this.octokit.rest.repos.getContent({ ...r, path, ref }));
    if (!res || Array.isArray(res.data) || res.data.type !== 'file' || !('content' in res.data)) return null;
    return Buffer.from(res.data.content, 'base64').toString('utf8');
  }

  async secretStatus(repo: string, name: string): Promise<CiSecretStatus> {
    try {
      const r = split(repo);
      // Metadata only: GitHub never returns the secret value.
      await withTimeout(this.octokit.rest.actions.getRepoSecret({ ...r, secret_name: name }), TIMEOUT);
      return 'ready';
    } catch (err) {
      return statusOf(err) === 404 ? 'not_set' : 'unknown';
    }
  }

  async commit(repo: string, input: CiCommitInput): Promise<{ commitSha: string }> {
    const r = split(repo);
    return this.write('git', async () => {
      const changes = [
        ...input.upserts.map((f) => ({ path: f.path, mode: '100644' as const, type: 'blob' as const, content: f.contents })),
        ...input.deletes.map((path) => ({ path, mode: '100644' as const, type: 'blob' as const, sha: null })),
      ];
      // No changes -> reuse the parent tree: an empty commit still lets a removal PR open (D-8).
      let treeSha = input.parent.treeSha;
      if (changes.length > 0) {
        const tree = await this.octokit.rest.git.createTree({ ...r, base_tree: input.parent.treeSha, tree: changes });
        treeSha = tree.data.sha;
      }
      const commit = await this.octokit.rest.git.createCommit({
        ...r,
        message: input.message,
        tree: treeSha,
        parents: [input.parent.commitSha],
      });
      if (input.createBranch) {
        await this.octokit.rest.git.createRef({ ...r, ref: `refs/heads/${input.branch}`, sha: commit.data.sha });
      } else {
        await this.octokit.rest.git.updateRef({ ...r, ref: `heads/${input.branch}`, sha: commit.data.sha, force: false });
      }
      return { commitSha: commit.data.sha };
    });
  }

  async findOpenPr(repo: string, headBranch: string): Promise<CiPr | null> {
    const r = split(repo);
    const res = await this.read('pulls', () =>
      this.octokit.rest.pulls.list({ ...r, state: 'open', head: `${r.owner}:${headBranch}`, per_page: 1 }),
    );
    const pr = res.data[0];
    return pr ? { url: pr.html_url, number: pr.number } : null;
  }

  async isMerged(repo: string, base: string, head: string): Promise<boolean> {
    const r = split(repo);
    const res = await this.read('git', () => this.octokit.rest.repos.compareCommits({ ...r, base, head, per_page: 1 }));
    return res.data.status === 'behind' || res.data.status === 'identical';
  }

  async openPr(repo: string, input: { title: string; head: string; base: string; body: string }): Promise<CiPr> {
    const r = split(repo);
    return this.write('pulls', async () => {
      const res = await this.octokit.rest.pulls.create({ ...r, ...input });
      return { url: res.data.html_url, number: res.data.number };
    });
  }

  async prState(repo: string, number: number): Promise<CiPrState> {
    const r = split(repo);
    const res = await this.read('pulls', () => this.octokit.rest.pulls.get({ ...r, pull_number: number }));
    if (res.data.merged) return 'merged';
    return res.data.state === 'closed' ? 'closed' : 'open';
  }

  async listWorkflowRuns(repo: string, workflowFile: string, sinceIso: string, limit: number): Promise<CiWorkflowRun[]> {
    const r = split(repo);
    // 404 = the workflow file is not on the default branch yet (export PR unmerged): no runs.
    const res = await this.readOrNull('actions', () =>
      this.octokit.rest.actions.listWorkflowRuns({
        ...r,
        workflow_id: workflowFile,
        event: 'pull_request',
        created: `>=${sinceIso}`,
        per_page: Math.min(limit, 100),
      }),
    );
    if (!res) return [];
    const self = `${r.owner}/${r.repo}`.toLowerCase();
    return res.data.workflow_runs.slice(0, limit).map((run) => ({
      id: run.id,
      status: run.status ?? 'unknown',
      conclusion: run.conclusion ?? null,
      htmlUrl: run.html_url,
      headSha: run.head_sha,
      createdAt: run.created_at,
      displayTitle: run.display_title ?? null,
      prNumber: run.pull_requests?.[0]?.number ?? null,
      headRepoIsFork: (run.head_repository?.full_name ?? '').toLowerCase() !== self,
    }));
  }

  async findArtifact(repo: string, runId: number, name: string): Promise<CiArtifactRef | null> {
    const r = split(repo);
    const res = await this.read('actions', () =>
      this.octokit.rest.actions.listWorkflowRunArtifacts({ ...r, run_id: runId, name, per_page: 1 }),
    );
    const a = res.data.artifacts[0];
    return a ? { id: a.id, sizeBytes: a.size_in_bytes, expired: a.expired } : null;
  }

  /**
   * Downloads the artifact zip and extracts exactly one small `.json` entry.
   * Zip-bomb guard: the compressed body is capped, only one `.json` entry is
   * inflated, and its declared size is checked BEFORE inflating (fflate `filter`)
   * and its real size after.
   */
  async downloadArtifactJson(repo: string, artifactId: number, maxBytes: number): Promise<CiArtifactDownload> {
    const r = split(repo);
    let body: ArrayBuffer;
    try {
      const res = await this.raw(
        () => this.octokit.rest.actions.downloadArtifact({ ...r, artifact_id: artifactId, archive_format: 'zip' }),
        DOWNLOAD_TIMEOUT,
      );
      body = res.data as unknown as ArrayBuffer;
    } catch (err) {
      const status = statusOf(err);
      if (status === 410 || status === 404) return { kind: 'expired' };
      throw classify(err, 'actions', false);
    }
    if (body.byteLength > maxBytes) return { kind: 'too_large' };

    let oversized = false;
    let entries: Record<string, Uint8Array> = {};
    try {
      entries = unzipSync(new Uint8Array(body), {
        filter: (f) => {
          if (!f.name.toLowerCase().endsWith('.json')) return false;
          if (f.originalSize > maxBytes) {
            oversized = true;
            return false;
          }
          return true;
        },
      });
    } catch {
      return { kind: 'ok', text: '' }; // a corrupt zip fails artifact validation downstream
    }
    if (oversized) return { kind: 'too_large' };
    const names = Object.keys(entries);
    const only = names.length === 1 ? entries[names[0]!] : undefined;
    if (!only) return { kind: 'ok', text: '' };
    if (only.byteLength > maxBytes) return { kind: 'too_large' };
    return { kind: 'ok', text: new TextDecoder('utf-8').decode(only) };
  }
}
