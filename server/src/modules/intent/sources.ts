import type { GitClient, GitHubClient, IssueMeta } from '@devdigest/shared';
import {
  MAX_BODY_CHARS,
  MAX_COMMITS,
  MAX_DOC_CHARS,
  MAX_DOCS,
  MAX_DOCS_TOTAL_CHARS,
  MAX_ISSUE_CHARS,
  MAX_PATHS,
  GITHUB_DEADLINE_MS,
} from './constants.js';
import { docFromPatch, extractDocLinks, extractIssueRefs, firstLine, isSafeDocPath, truncate } from './helpers.js';
import type {
  GatheredDoc,
  GatheredSources,
  GatherContext,
  IntentPullReader,
  IntentSourcesPort,
  SourceRef,
} from './ports.js';

function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('github deadline exceeded')), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export interface IntentSourcesDeps {
  /** Resolves the GitHub client; throws when no token is configured (→ DB fallback). */
  github: () => Promise<GitHubClient>;
  git: GitClient;
  pulls: IntentPullReader;
}

/**
 * Infrastructure adapter: collects the classifier's inputs. GitHub is tried
 * first (fresh title/body/issue/commits) and every piece falls back to what is
 * persisted, so an offline or token-less setup still works. Only same-repo docs
 * are read (patch first, then the local clone); nothing else is ever fetched.
 */
export class GitHubIntentSources implements IntentSourcesPort {
  constructor(private deps: IntentSourcesDeps) {}

  async gather(ctx: GatherContext): Promise<GatheredSources> {
    const { pull, repo } = ctx;
    const refs: SourceRef[] = [];

    let gh: GitHubClient | null = null;
    if (ctx.fresh !== false) {
      try {
        gh = await this.deps.github();
      } catch {
        gh = null;
      }
    }
    let detail: Awaited<ReturnType<GitHubClient['getPullRequest']>> | null = null;
    if (gh) {
      try {
        // Bounded: a slow/unreachable GitHub must not stall derivation (falls back to the DB).
        detail = await withDeadline(gh.getPullRequest(repo, pull.number), GITHUB_DEADLINE_MS);
      } catch {
        detail = null;
      }
    }

    const title = detail?.title ?? pull.title;
    const body = truncate(detail?.body ?? pull.body ?? '', MAX_BODY_CHARS).text;
    refs.push({ kind: 'title', ref: 'title', status: 'used' });
    if (body.trim()) refs.push({ kind: 'description', ref: 'description', status: 'used' });

    // ---- linked issue
    let issueMeta: IssueMeta | null | undefined = detail?.linked_issue;
    if (!issueMeta && gh) {
      const n = extractIssueRefs(body)[0];
      if (n !== undefined) {
        try {
          issueMeta = await gh.getIssue(repo, n);
        } catch {
          issueMeta = null;
        }
      }
    }
    const issue = issueMeta
      ? {
          number: issueMeta.number,
          title: issueMeta.title,
          body: truncate(issueMeta.body ?? '', MAX_ISSUE_CHARS).text,
        }
      : null;
    if (issue) refs.push({ kind: 'issue', ref: `#${issue.number}`, status: 'used' });

    // ---- commits + changed files
    const commits = (detail ? detail.commits.map((c) => c.message) : (await this.deps.pulls.listPrCommits(pull.id)).map((c) => c.message))
      .map(firstLine)
      .filter(Boolean)
      .slice(0, MAX_COMMITS);
    if (commits.length > 0) refs.push({ kind: 'commits', ref: `${commits.length} commit(s)`, status: 'used' });

    const files: { path: string; patch: string | null }[] = detail
      ? detail.files.map((f) => ({ path: f.path, patch: f.patch ?? null }))
      : await this.deps.pulls.listPrFiles(pull.id);
    const allPaths = files.length > 0 ? files.map((f) => f.path) : (ctx.changedPaths ?? []);
    const paths = allPaths.slice(0, MAX_PATHS);
    if (paths.length > 0) {
      refs.push({ kind: 'files', ref: `${paths.length} path(s)`, status: paths.length < allPaths.length ? 'truncated' : 'used' });
    }
    refs.push({ kind: 'branch', ref: 'branch', status: 'used' });

    // ---- linked docs (same repo only) + foreign links (recorded, never fetched)
    const { docs: docPaths, external } = extractDocLinks(`${body}\n${issue?.body ?? ''}`, repo);
    for (const url of external) refs.push({ kind: 'link', ref: url, status: 'unfetched' });

    const docs: GatheredDoc[] = [];
    let total = 0;
    for (const path of docPaths.slice(0, MAX_DOCS)) {
      const patch = files.find((f) => f.path === path)?.patch;
      let content: string | null = null;
      try {
        content = patch ? docFromPatch(patch) : await this.readLocal(repo, path);
      } catch {
        content = null;
      }
      if (!content || !content.trim()) {
        refs.push({ kind: 'doc', ref: path, status: 'failed' });
        continue;
      }
      const room = Math.min(MAX_DOC_CHARS, MAX_DOCS_TOTAL_CHARS - total);
      if (room <= 0) {
        refs.push({ kind: 'doc', ref: path, status: 'truncated' });
        continue;
      }
      const cut = truncate(content, room);
      total += cut.text.length;
      docs.push({ path, content: cut.text, truncated: cut.truncated });
      refs.push({ kind: 'doc', ref: path, status: cut.truncated ? 'truncated' : 'used' });
    }
    for (const path of docPaths.slice(MAX_DOCS)) refs.push({ kind: 'doc', ref: path, status: 'unfetched' });

    return { title, body, issue, docs, branch: pull.branch, commits, paths, refs };
  }

  /** Read a doc from the local clone (the GitClient adapter refuses paths that escape it). */
  private async readLocal(repo: GatherContext['repo'], path: string): Promise<string> {
    if (!isSafeDocPath(path)) throw new Error('unsafe doc path');
    return this.deps.git.readFile(repo, path);
  }
}
