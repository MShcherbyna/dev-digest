import type { z } from 'zod';
import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
  Embedder,
  GitHubClient,
  RepoRef,
  PrMeta,
  PrDetail,
  GitHubReviewPayload,
  CreateReviewCommentInput,
  PrReviewComment,
  OpenPrPayload,
  CommitFilesPayload,
  IssueMeta,
  GitClient,
  CloneOptions,
  UnifiedDiff,
  BlameLine,
  GitCommit,
  CodeIndex,
  CodeMatch,
  CodeSymbol,
  CodeReference,
  AuthProvider,
  AuthUser,
  AuthWorkspace,
  SecretsProvider,
  SecretKey,
} from '@devdigest/shared';
import { parseUnifiedDiff } from './git/diff-parser.js';
import type { PriorPrHit, PriorPrQuery, PriorPrSource } from '../modules/blast/ports.js';
import type { DocFile, DocRead, RepoDocsSource } from '../modules/project-context/ports.js';
import type { FileRead, FsKind, RepoFile, RepoFiles } from '../modules/onboarding/ports.js';
import {
  CiGitHubError,
  type BranchHead,
  type CiArtifactDownload,
  type CiArtifactRef,
  type CiCommitInput,
  type CiGitHub,
  type CiPr,
  type CiPrState,
  type CiWorkflowRun,
  type RunnerBundle,
} from '../modules/ci/ports.js';
import type { CiSecretStatus } from '@devdigest/shared';

/**
 * Deterministic MOCK adapters for tests/dev — NO real network. Each mirrors the
 * adapter interface. The mock LLM returns a caller-supplied fixture (or a default)
 * for completeStructured, so review/grounding flows can be tested end-to-end.
 */

// ---------- Mock LLM ----------
export interface MockLLMOptions {
  models?: ModelInfo[];
  /** Fixture returned by completeStructured (validated against the schema). */
  structured?: unknown;
  /**
   * Per-schemaName fixtures for multi-call flows (e.g. the conventions 2-step
   * dialogue: 'ConventionFileSelection' then 'ConventionExtraction'). Looked up
   * by req.schemaName; falls back to `structured` when no entry matches.
   */
  structuredBySchema?: Record<string, unknown>;
  completionText?: string;
  embedding?: number[];
}

export class MockLLMProvider implements LLMProvider {
  readonly id: 'openai' | 'anthropic';
  public calls: { method: string; req: unknown }[] = [];

  constructor(
    id: 'openai' | 'anthropic' = 'openai',
    private opts: MockLLMOptions = {},
  ) {
    this.id = id;
  }

  async listModels(): Promise<ModelInfo[]> {
    this.calls.push({ method: 'listModels', req: null });
    return (
      this.opts.models ?? [
        { id: 'gpt-4.1', provider: this.id === 'anthropic' ? 'anthropic' : 'openai' },
      ]
    );
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.calls.push({ method: 'complete', req });
    return {
      text: this.opts.completionText ?? 'mock completion',
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
    };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    const fixture = this.opts.structuredBySchema?.[req.schemaName] ?? this.opts.structured ?? {};
    const parsed = (req.schema as z.ZodType<T>).safeParse(fixture);
    if (!parsed.success) {
      throw new Error(`MockLLMProvider fixture failed schema: ${parsed.error.message}`);
    }
    return {
      data: parsed.data,
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
      raw: JSON.stringify(fixture),
      attempts: 1,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    this.calls.push({ method: 'embed', req: texts });
    return texts.map(() => this.opts.embedding ?? new Array(1536).fill(0));
  }
}

// ---------- Mock Embedder ----------
export class MockEmbedder implements Embedder {
  readonly dims = 1536;
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((_, i) => new Array(1536).fill(0).map((_, j) => (i + j) % 2));
  }
}

// ---------- Mock GitHub ----------
export interface MockGitHubOptions {
  pulls?: PrMeta[];
  detail?: Partial<PrDetail>;
  login?: string;
  /** Existing inline review comments returned by listReviewComments. */
  comments?: PrReviewComment[];
}

export class MockGitHubClient implements GitHubClient {
  public posted: { n: number; review: GitHubReviewPayload }[] = [];
  public openedPrs: OpenPrPayload[] = [];
  public committed: CommitFilesPayload[] = [];
  public createdComments: CreateReviewCommentInput[] = [];

  constructor(private opts: MockGitHubOptions = {}) {}

  async listPullRequests(_repo: RepoRef): Promise<PrMeta[]> {
    return (
      this.opts.pulls ?? [
        {
          number: 482,
          title: 'Add rate limiting to public API endpoints',
          author: 'marisa.koch',
          branch: 'feat/rate-limit-public',
          base: 'main',
          head_sha: 'a1b2c3d4',
          additions: 247,
          deletions: 38,
          files_count: 9,
          status: 'open',
          opened_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T03:00:00Z',
        },
      ]
    );
  }

  async getPullRequest(_repo: RepoRef, n: number): Promise<PrDetail> {
    const base: PrDetail = {
      number: n,
      title: 'Add rate limiting to public API endpoints',
      author: 'marisa.koch',
      branch: 'feat/rate-limit-public',
      base: 'main',
      head_sha: 'a1b2c3d4',
      additions: 247,
      deletions: 38,
      files_count: 9,
      status: 'open',
      body: 'Add rate limiting. Closes #471.',
      files: [
        {
          path: 'src/config.ts',
          additions: 4,
          deletions: 0,
          patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
        },
      ],
      commits: [
        { sha: 'a1b2c3d4', message: 'Add limiter', author: 'marisa.koch', committed_at: null },
      ],
      linked_issue: null,
    };
    return { ...base, ...this.opts.detail };
  }

  async postReview(_repo: RepoRef, n: number, review: GitHubReviewPayload): Promise<{ id: string }> {
    this.posted.push({ n, review });
    return { id: `mock-review-${n}` };
  }

  async listReviewComments(_repo: RepoRef, _n: number): Promise<PrReviewComment[]> {
    return this.opts.comments ?? [];
  }

  async createReviewComment(
    _repo: RepoRef,
    _n: number,
    input: CreateReviewCommentInput,
  ): Promise<PrReviewComment> {
    this.createdComments.push(input);
    return {
      id: this.createdComments.length,
      path: input.path,
      line: input.line,
      original_line: input.line,
      side: input.side ?? 'RIGHT',
      body: input.body,
      user: this.opts.login ?? 'mock-user',
      created_at: '2026-06-01T00:00:00Z',
      html_url: `https://github.com/mock/mock/pull/1#discussion_r${this.createdComments.length}`,
      in_reply_to_id: input.inReplyTo ?? null,
      is_outdated: false,
    };
  }

  async openPullRequest(_repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string }> {
    this.openedPrs.push(payload);
    return { url: 'https://github.com/mock/mock/pull/1' };
  }

  async commitFiles(_repo: RepoRef, payload: CommitFilesPayload): Promise<{ branch: string }> {
    this.committed.push(payload);
    return { branch: payload.branch };
  }

  async findOpenPr(_repo: RepoRef, branch: string): Promise<{ url: string } | null> {
    const pr = this.openedPrs.find((p) => p.head === branch);
    return pr ? { url: 'https://github.com/mock/mock/pull/1' } : null;
  }

  async getIssue(_repo: RepoRef, n: number): Promise<IssueMeta> {
    return { number: n, title: `Issue #${n}`, body: 'mock issue', state: 'open' };
  }

  async currentLogin(): Promise<string> {
    return this.opts.login ?? 'mock-user';
  }
}

// ---------- Mock Git ----------
export interface MockGitOptions {
  diff?: string;
  files?: Record<string, string>;
  /** Name-only diff result (drives the incremental indexer's "changed files since X" path). */
  diffNameOnly?: string[];
  /** Override `currentHead()` so tests can simulate "sha unchanged since last index". */
  head?: string;
  /** Head `currentHead()` returns AFTER `sync()` runs — simulates fetch+reset advancing HEAD. */
  syncedHead?: string;
}

export class MockGitClient implements GitClient {
  public cloned: { repo: RepoRef; url: string }[] = [];
  public syncs: { repo: RepoRef; branch: string }[] = [];
  private syncedHead?: string;

  constructor(private opts: MockGitOptions = {}) {}

  clonePathFor(repo: RepoRef): string {
    return `/mock/clones/${repo.owner}/${repo.name}`;
  }
  async clone(repo: RepoRef, url: string, _opts?: CloneOptions): Promise<{ path: string }> {
    this.cloned.push({ repo, url });
    return { path: this.clonePathFor(repo) };
  }
  async fetchPullHead(): Promise<void> {}
  async sync(repo: RepoRef, branch: string): Promise<{ head: string }> {
    this.syncs.push({ repo, branch });
    // After a sync, HEAD advances to syncedHead (or stays at head if unset).
    this.syncedHead = this.opts.syncedHead ?? this.opts.head ?? 'a1b2c3d4';
    return { head: this.syncedHead };
  }
  async currentHead(): Promise<string> {
    return this.syncedHead ?? this.opts.head ?? 'a1b2c3d4';
  }
  async diffNameOnly(): Promise<string[]> {
    return this.opts.diffNameOnly ?? [];
  }
  async diff(): Promise<UnifiedDiff> {
    const raw =
      this.opts.diff ??
      'diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';
    return parseUnifiedDiff(raw);
  }
  async blame(): Promise<BlameLine[]> {
    return [{ line: 1, sha: 'a1b2c3d4', author: 'marisa.koch', date: '2026-06-01', summary: 'init' }];
  }
  async log(): Promise<GitCommit[]> {
    return [{ sha: 'a1b2c3d4', message: 'init', author: 'marisa.koch', date: '2026-06-01' }];
  }
  async readFile(_repo: RepoRef, path: string): Promise<string> {
    return this.opts.files?.[path] ?? '';
  }
}

// ---------- Mock CodeIndex ----------
export class MockCodeIndex implements CodeIndex {
  async grep(_repo: RepoRef, pattern: string): Promise<CodeMatch[]> {
    return [{ path: 'src/config.ts', line: 12, text: `match for ${pattern}` }];
  }
  async symbols(): Promise<CodeSymbol[]> {
    return [{ path: 'src/middleware/ratelimit.ts', name: 'rateLimit', kind: 'function', line: 25 }];
  }
  async references(_repo: RepoRef, symbol: string): Promise<CodeReference[]> {
    return [{ fromPath: 'src/api/public/index.ts', toSymbol: symbol, line: 23 }];
  }
}

// ---------- Mock Prior-PR source ----------
/**
 * Deterministic prior-PR hits: three merged PRs, one unmerged and one equal to
 * the current PR number (exercises both filters). All touch the first queried path.
 */
export class MockPriorPrSource implements PriorPrSource {
  readonly calls: PriorPrQuery[] = [];
  constructor(private opts: { selfNumber?: number } = {}) {}

  async listForPaths(q: PriorPrQuery): Promise<PriorPrHit[]> {
    this.calls.push(q);
    const path = q.paths[0] ?? '';
    const hit = (number: number, title: string, mergedAt: string | null, author: string, body: string): PriorPrHit => ({
      number, title, mergedAt, author, body, path,
    });
    return [
      hit(288, 'Webhook forwarding for connect accounts', '2025-12-11T10:00:00Z', 'tomek.w', 'Last change to webhooks.'),
      hit(401, 'Introduce public API namespace', '2026-03-18T10:00:00Z', 'deepak.r', '## Summary\n\nOriginal split-out of the public router.'),
      hit(356, 'Add ioredis client for session cache', '2026-02-02T10:00:00Z', 'marisa.koch', ''),
      hit(500, 'Still open', null, 'someone', 'not merged'),
      hit(this.opts.selfNumber ?? 1, 'The current PR', '2026-04-01T10:00:00Z', 'me', 'self'),
    ];
  }
}

// ---------- Mock Auth / Secrets ----------
export class MockAuthProvider implements AuthProvider {
  constructor(
    private user: AuthUser = { id: 'u1', email: 'you@local', name: 'You' },
    private workspace: AuthWorkspace = { id: 'w1', name: 'default' },
  ) {}
  async currentUser(): Promise<AuthUser> {
    return this.user;
  }
  async currentWorkspace(): Promise<AuthWorkspace> {
    return this.workspace;
  }
}

export class MockSecretsProvider implements SecretsProvider {
  constructor(private secrets: Partial<Record<string, string>> = {}) {}
  async get(key: SecretKey): Promise<string | undefined> {
    return this.secrets[key as string];
  }
}

// ---------- Mock repo docs (project-context) ----------
/** Files keyed by repo-relative path: text, `{ size }` (too large), or 'unreadable'. */
export type MockRepoDocsFiles = Record<string, string | { size: number } | 'unreadable'>;

export class MockRepoDocsSource implements RepoDocsSource {
  /** `root` is ignored; null `files` simulates a missing clone directory. */
  constructor(private files: MockRepoDocsFiles | null = {}) {}

  async walk(
    _root: string,
    excluded: ReadonlySet<string>,
    accept: (relPath: string) => boolean,
  ): Promise<DocFile[] | null> {
    if (!this.files) return null;
    return Object.entries(this.files)
      .filter(([p]) => !p.split('/').slice(0, -1).some((s) => excluded.has(s)) && accept(p))
      .map(([path, v]) => ({
        path,
        size:
          v === 'unreadable' ? 0 : typeof v === 'string' ? Buffer.byteLength(v, 'utf8') : v.size,
      }));
  }

  async read(_root: string, relPath: string, maxBytes: number): Promise<DocRead> {
    const v = this.files?.[relPath];
    if (v === undefined) return { kind: 'missing' };
    if (v === 'unreadable') return { kind: 'unreadable' };
    if (typeof v !== 'string') return v.size > maxBytes ? { kind: 'too_large' } : { kind: 'unreadable' };
    return Buffer.byteLength(v, 'utf8') > maxBytes ? { kind: 'too_large' } : { kind: 'ok', content: v };
  }
}

/** In-memory clone tree for onboarding tests. A string is file content, `'dir'` a directory, `'symlink'` a refused path. */
export type MockRepoTree = Record<string, string | 'dir' | 'symlink'>;

export class MockRepoFiles implements RepoFiles {
  /** Every `read()` call, so tests can assert which files were (not) read. */
  public reads: string[] = [];

  /** `root` is ignored; a null tree simulates a missing clone directory. */
  constructor(private tree: MockRepoTree | null = {}) {}

  async isDirectory(): Promise<boolean> {
    return this.tree !== null;
  }

  async kind(_root: string, relPath: string): Promise<FsKind> {
    if (!this.tree) return 'invalid';
    const rel = relPath.endsWith('/') ? relPath.slice(0, -1) : relPath;
    if (rel === '' || rel.split('/').some((s) => s === '' || s === '.' || s === '..')) return 'invalid';
    const v = this.tree[rel];
    if (v === 'symlink') return 'invalid';
    if (v === 'dir') return 'directory';
    if (v !== undefined) return 'file';
    return Object.keys(this.tree).some((k) => k.startsWith(`${rel}/`)) ? 'directory' : 'missing';
  }

  async walk(
    _root: string,
    excluded: ReadonlySet<string>,
    accept: (relPath: string) => boolean,
  ): Promise<RepoFile[] | null> {
    if (!this.tree) return null;
    return Object.entries(this.tree)
      .filter(([, v]) => v !== 'dir' && v !== 'symlink')
      .filter(([p]) => !p.split('/').slice(0, -1).some((s) => excluded.has(s)) && accept(p))
      .map(([path, v]) => ({ path, size: Buffer.byteLength(v, 'utf8') }));
  }

  async read(_root: string, relPath: string, maxBytes: number): Promise<FileRead> {
    this.reads.push(relPath);
    const v = this.tree?.[relPath];
    if (v === undefined || v === 'dir') return { kind: 'missing' };
    if (v === 'symlink') return { kind: 'unreadable' };
    return Buffer.byteLength(v, 'utf8') > maxBytes ? { kind: 'too_large' } : { kind: 'ok', content: v };
  }

  async listShallow(
    _root: string,
    depth: number,
    max: number,
    excluded: ReadonlySet<string>,
  ): Promise<string[]> {
    if (!this.tree) return [];
    const out = new Set<string>();
    for (const [p, v] of Object.entries(this.tree)) {
      if (v === 'symlink') continue;
      const segs = p.split('/');
      if (segs.some((s) => excluded.has(s))) continue;
      for (let i = 1; i <= Math.min(segs.length, depth); i++) {
        const isLeaf = i === segs.length;
        const rel = segs.slice(0, i).join('/');
        out.add(isLeaf && v !== 'dir' ? rel : `${rel}/`);
      }
    }
    return [...out].sort().slice(0, max);
  }
}

// ---------- Mock CI GitHub (Export to CI) ----------
export type MockCiOp =
  | 'getBranchHead'
  | 'listTreePaths'
  | 'readFile'
  | 'secretStatus'
  | 'commit'
  | 'findOpenPr'
  | 'openPr'
  | 'prState'
  | 'listWorkflowRuns'
  | 'findArtifact'
  | 'downloadArtifactJson';

export interface MockCiArtifact {
  name: string;
  /** The artifact's JSON text; omit for an artifact the download reports as expired/too large. */
  text?: string;
  expired?: boolean;
  sizeBytes?: number;
  download?: 'expired' | 'too_large';
}

/**
 * In-memory GitHub repository for the ci module: branches with file snapshots,
 * PRs, workflow runs and artifacts. Records every call (`calls`) and can inject
 * a `CiGitHubError` per operation (`failOn`). No network.
 */
export class MockCiGitHub implements CiGitHub {
  readonly calls: { op: MockCiOp; args: unknown[] }[] = [];
  readonly commits: CiCommitInput[] = [];
  readonly failOn = new Map<MockCiOp, CiGitHubError>();
  readonly secrets = new Map<string, CiSecretStatus>();
  /** Open/merged/closed PRs the mock knows about. */
  readonly prs: (CiPr & { head: string; base: string; title: string; state: CiPrState })[] = [];
  /** Optional gate awaited by listWorkflowRuns (hold a refresh open in a test). */
  gate: Promise<void> | null = null;

  private snapshots = new Map<string, Map<string, string>>();
  private branches = new Map<string, string>();
  private runs: CiWorkflowRun[] = [];
  private artifacts = new Map<number, { runId: number; ref: CiArtifactRef; artifact: MockCiArtifact }>();
  private seq = 0;

  constructor(opts: { defaultBranch?: string; files?: Record<string, string> } = {}) {
    const base = `c${this.seq++}`;
    this.snapshots.set(base, new Map(Object.entries(opts.files ?? {})));
    this.branches.set(opts.defaultBranch ?? 'main', base);
  }

  count(op: MockCiOp): number {
    return this.calls.filter((c) => c.op === op).length;
  }

  /** Files on a branch (or commit sha), for assertions. */
  filesOf(ref: string): Record<string, string> {
    return Object.fromEntries(this.snapshots.get(this.branches.get(ref) ?? ref) ?? []);
  }

  hasBranch(branch: string): boolean {
    return this.branches.has(branch);
  }

  addRun(run: Partial<CiWorkflowRun> & { id: number }, artifact?: MockCiArtifact): void {
    this.runs.push({
      status: 'completed',
      conclusion: 'success',
      htmlUrl: `https://github.com/acme/repo/actions/runs/${run.id}`,
      headSha: 'abc123',
      createdAt: new Date().toISOString(),
      displayTitle: 'PR title',
      prNumber: null,
      headRepoIsFork: false,
      ...run,
    });
    if (artifact) {
      const id = run.id * 10;
      this.artifacts.set(id, {
        runId: run.id,
        ref: { id, sizeBytes: artifact.sizeBytes ?? artifact.text?.length ?? 0, expired: artifact.expired ?? false },
        artifact,
      });
    }
  }

  private enter(op: MockCiOp, ...args: unknown[]): void {
    this.calls.push({ op, args });
    const err = this.failOn.get(op);
    if (err) throw err;
  }

  private head(branch: string): BranchHead | null {
    const sha = this.branches.get(branch);
    return sha ? { commitSha: sha, treeSha: `tree:${sha}` } : null;
  }

  async getBranchHead(_repo: string, branch: string): Promise<BranchHead | null> {
    this.enter('getBranchHead', branch);
    return this.head(branch);
  }

  async listTreePaths(_repo: string, treeSha: string): Promise<Set<string>> {
    this.enter('listTreePaths', treeSha);
    return new Set(this.snapshots.get(treeSha.replace(/^tree:/, ''))?.keys() ?? []);
  }

  async readFile(_repo: string, ref: string, path: string): Promise<string | null> {
    this.enter('readFile', ref, path);
    const files = this.snapshots.get(ref) ?? this.snapshots.get(this.branches.get(ref) ?? '');
    return files?.get(path) ?? null;
  }

  async secretStatus(_repo: string, name: string): Promise<CiSecretStatus> {
    this.calls.push({ op: 'secretStatus', args: [name] });
    if (this.failOn.has('secretStatus')) return 'unknown';
    return this.secrets.get(name) ?? 'not_set';
  }

  async commit(_repo: string, input: CiCommitInput): Promise<{ commitSha: string }> {
    this.enter('commit', input.branch);
    this.commits.push(input);
    const files = new Map(this.snapshots.get(input.parent.commitSha) ?? []);
    for (const u of input.upserts) files.set(u.path, u.contents);
    for (const d of input.deletes) files.delete(d);
    const sha = `c${this.seq++}`;
    this.snapshots.set(sha, files);
    if (!input.createBranch && !this.branches.has(input.branch)) throw new CiGitHubError('unexpected', 'branch missing');
    this.branches.set(input.branch, sha);
    return { commitSha: sha };
  }

  async findOpenPr(_repo: string, headBranch: string): Promise<CiPr | null> {
    this.enter('findOpenPr', headBranch);
    const pr = this.prs.find((p) => p.head === headBranch && p.state === 'open');
    return pr ? { url: pr.url, number: pr.number } : null;
  }

  async openPr(_repo: string, input: { title: string; head: string; base: string; body: string }): Promise<CiPr> {
    this.enter('openPr', input.title);
    const number = 100 + this.prs.length;
    const pr = { number, url: `https://github.com/acme/repo/pull/${number}`, head: input.head, base: input.base, title: input.title, state: 'open' as const };
    this.prs.push(pr);
    return { url: pr.url, number };
  }

  async prState(_repo: string, number: number): Promise<CiPrState> {
    this.enter('prState', number);
    return this.prs.find((p) => p.number === number)?.state ?? 'open';
  }

  async listWorkflowRuns(_repo: string, _file: string, sinceIso: string, limit: number): Promise<CiWorkflowRun[]> {
    this.enter('listWorkflowRuns', sinceIso);
    if (this.gate) await this.gate;
    return this.runs.filter((r) => r.createdAt >= sinceIso).slice(0, limit);
  }

  async findArtifact(_repo: string, runId: number, name: string): Promise<CiArtifactRef | null> {
    this.enter('findArtifact', runId);
    for (const a of this.artifacts.values()) {
      if (a.runId === runId && a.artifact.name === name) return a.ref;
    }
    return null;
  }

  async downloadArtifactJson(_repo: string, artifactId: number, _max: number): Promise<CiArtifactDownload> {
    this.enter('downloadArtifactJson', artifactId);
    const a = this.artifacts.get(artifactId)?.artifact;
    if (!a || a.download === 'expired') return { kind: 'expired' };
    if (a.download === 'too_large') return { kind: 'too_large' };
    return { kind: 'ok', text: a.text ?? '' };
  }
}

// ---------- Mock runner bundle ----------
export class MockRunnerBundle implements RunnerBundle {
  constructor(private text = '// devdigest runner bundle (mock)\n') {}
  async read(): Promise<string> {
    return this.text;
  }
}
