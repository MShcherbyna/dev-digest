import type { GitHubClient } from '@devdigest/shared';
import { withTimeout } from '../../platform/resilience.js';
import { BLAST_GITHUB_DEADLINE_MS } from './constants.js';
import type { BlastPull, BlastRemoteFiles } from './ports.js';

/**
 * Infrastructure adapter: lists a PR's changed paths via the container's
 * existing GitHub client (the same `getPullRequest` call `GET /pulls/:id`
 * makes). Used only when no files are persisted; any failure (no token,
 * offline, rate limit, deadline exceeded) degrades to `[]` rather than failing the read.
 */
export class GitHubChangedFiles implements BlastRemoteFiles {
  constructor(private deps: { github: () => Promise<GitHubClient> }) {}

  async listChangedPaths(pull: BlastPull): Promise<string[]> {
    try {
      const gh = await this.deps.github();
      const detail = await withTimeout(
        gh.getPullRequest(pull.repo, pull.number),
        BLAST_GITHUB_DEADLINE_MS,
      );
      return detail.files.map((f) => f.path);
    } catch {
      return [];
    }
  }
}
