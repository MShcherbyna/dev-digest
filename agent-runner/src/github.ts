import type { GitHubReviewPayload } from '@devdigest/shared';
import { RunnerError } from './errors.js';
import type { PrContext } from './context.js';

/**
 * Thin GitHub REST client built on the global `fetch` (Node 22) — NOT octokit.
 * `octokit` is not a declared dependency of this package (see
 * `agent-runner/package.json`) and the bundle must stay self-contained with no
 * `node_modules/@devdigest/*` (or other) runtime imports beyond what's
 * declared; hand-rolled REST calls keep the surface small and dependency-free.
 * `fetchImpl` is injectable so tests never hit the network.
 */

export type FetchLike = typeof fetch;

const GITHUB_API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const USER_AGENT = 'devdigest-agent-runner';

function authHeaders(token: string, accept: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': USER_AGENT,
  };
}

/**
 * Fetch the PR's unified diff via the GitHub API's diff media type. GitHub
 * refuses that media type for a diff over 20 000 lines (406 `too_large`); the
 * diff is then rebuilt from the paginated `/files` list instead.
 */
export async function fetchPrDiff(
  ctx: Pick<PrContext, 'owner' | 'repo' | 'prNumber'>,
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const url = `${GITHUB_API_BASE}/repos/${ctx.owner}/${ctx.repo}/pulls/${ctx.prNumber}`;
  const res = await fetchImpl(url, {
    headers: authHeaders(token, 'application/vnd.github.v3.diff'),
  });
  if (res.status === 406) return fetchPrDiffFromFiles(url, token, fetchImpl);
  if (!res.ok) {
    throw new RunnerError(
      `GitHub API error fetching PR diff (${url}): ${res.status} ${await res.text().catch(() => '')}`,
    );
  }
  return res.text();
}

interface PrFile {
  filename: string;
  previous_filename?: string;
  status: string;
  /** Absent for binary files and for a single file whose patch is too large. */
  patch?: string;
}

/** GitHub lists at most 3000 files for a PR, 100 per page. */
const FILES_PER_PAGE = 100;
const MAX_FILE_PAGES = 30;

/**
 * Rebuild a unified diff (one `diff --git a/<old> b/<new>` section per file, the
 * shape `stripIgnoredFiles` / `parseUnifiedDiff` expect) from `GET /pulls/{n}/files`.
 * Files without a `patch` (binary, or too large on their own) are skipped: nothing
 * in them can be cited anyway.
 */
async function fetchPrDiffFromFiles(prUrl: string, token: string, fetchImpl: FetchLike): Promise<string> {
  const sections: string[] = [];
  for (let page = 1; page <= MAX_FILE_PAGES; page++) {
    const url = `${prUrl}/files?per_page=${FILES_PER_PAGE}&page=${page}`;
    const res = await fetchImpl(url, { headers: authHeaders(token, 'application/vnd.github+json') });
    if (!res.ok) {
      throw new RunnerError(
        `GitHub API error listing PR files (${url}): ${res.status} ${await res.text().catch(() => '')}`,
      );
    }
    const files = (await res.json()) as PrFile[];
    for (const f of files) {
      if (!f.patch) continue;
      const oldPath = f.previous_filename ?? f.filename;
      sections.push(
        [
          `diff --git a/${oldPath} b/${f.filename}`,
          f.status === 'added' ? '--- /dev/null' : `--- a/${oldPath}`,
          f.status === 'removed' ? '+++ /dev/null' : `+++ b/${f.filename}`,
          f.patch,
        ].join('\n'),
      );
    }
    if (files.length < FILES_PER_PAGE) break;
  }
  return sections.length > 0 ? `${sections.join('\n')}\n` : '';
}

/** Post a full review (body + event + optional inline comments) — `post_as: 'github_review'`. */
export async function postGithubReview(
  ctx: Pick<PrContext, 'owner' | 'repo' | 'prNumber'>,
  token: string,
  payload: GitHubReviewPayload,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const url = `${GITHUB_API_BASE}/repos/${ctx.owner}/${ctx.repo}/pulls/${ctx.prNumber}/reviews`;
  const post = (body: Record<string, unknown>) =>
    fetchImpl(url, {
      method: 'POST',
      headers: {
        ...authHeaders(token, 'application/vnd.github+json'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  // GitHub's Actions token (`GITHUB_TOKEN`) — which the runner always posts with
  // — is NOT permitted to APPROVE a PR (422 "GitHub Actions is not permitted to
  // approve pull requests"). Downgrade an APPROVE event to COMMENT; the body
  // still renders the "Approved ✅" summary, we just don't submit the formal
  // approval GitHub would reject.
  const event = payload.event === 'APPROVE' ? 'COMMENT' : payload.event;
  const base = { body: payload.body, event };
  const hasComments = !!payload.comments && payload.comments.length > 0;
  const withComments = hasComments
    ? { ...base, comments: payload.comments!.map((c) => ({ path: c.path, line: c.line, body: c.body })) }
    : base;

  let res = await post(withComments);

  // GitHub rejects the WHOLE review with a 422 if ANY inline comment targets a
  // file whose diff it can't resolve (e.g. "diff too large" for a huge file).
  // `stripIgnoredFiles` removes our own bundle, but a genuinely large file in a
  // normal PR could still trip this — so degrade gracefully to a body-only
  // review. Every finding is already in `payload.body`; only the inline anchors
  // are lost, which beats posting nothing.
  if (res.status === 422 && hasComments) {
    res = await post(base);
  }

  if (!res.ok) {
    throw new RunnerError(
      `GitHub API error posting review (${url}): ${res.status} ${await res.text().catch(() => '')}`,
    );
  }
}

/** Post a plain issue comment (no review event) — `post_as: 'pr_comment'`. */
export async function postPrComment(
  ctx: Pick<PrContext, 'owner' | 'repo' | 'prNumber'>,
  token: string,
  body: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const url = `${GITHUB_API_BASE}/repos/${ctx.owner}/${ctx.repo}/issues/${ctx.prNumber}/comments`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      ...authHeaders(token, 'application/vnd.github+json'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    throw new RunnerError(
      `GitHub API error posting PR comment (${url}): ${res.status} ${await res.text().catch(() => '')}`,
    );
  }
}
