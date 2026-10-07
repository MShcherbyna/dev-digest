import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BlastPull, BlastPullReader } from './ports.js';

export class BlastRepository implements BlastPullReader {
  constructor(private db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<BlastPull | undefined> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        number: t.pullRequests.number,
        headSha: t.pullRequests.headSha,
        base: t.pullRequests.base,
        owner: t.repos.owner,
        name: t.repos.name,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;
    return {
      prId: row.id,
      repoId: row.repoId,
      number: row.number,
      headSha: row.headSha,
      base: row.base,
      repo: { owner: row.owner, name: row.name },
    };
  }

  async listChangedPaths(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return rows.map((r) => r.path);
  }
}
