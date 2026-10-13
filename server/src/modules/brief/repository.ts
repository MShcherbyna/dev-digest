import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BriefFile, BriefFinding, BriefPull, BriefStore } from './ports.js';
import { StoredBrief } from './schemas.js';

export class BriefRepository implements BriefStore {
  constructor(private db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<BriefPull | undefined> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        headSha: t.pullRequests.headSha,
        clonePath: t.repos.clonePath,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async listFiles(prId: string): Promise<BriefFile[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
        patch: t.prFiles.patch,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(asc(t.prFiles.path));
  }

  /** Non-dismissed findings of the latest `kind='review'` review (same rule as the finding anchors). */
  async latestReviewFindings(prId: string): Promise<BriefFinding[]> {
    const [latest] = await this.db
      .select({ id: t.reviews.id })
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt))
      .limit(1);
    if (!latest) return [];
    const rows = await this.db
      .select({
        file: t.findings.file,
        line: t.findings.startLine,
        severity: t.findings.severity,
        title: t.findings.title,
      })
      .from(t.findings)
      .where(and(eq(t.findings.reviewId, latest.id), isNull(t.findings.dismissedAt)));
    return rows;
  }

  /** A row that no longer parses (older shape, manual edit) reads as "no brief". */
  async getBrief(prId: string): Promise<StoredBrief | null> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .where(eq(t.prBrief.prId, prId));
    if (!row) return null;
    const parsed = StoredBrief.safeParse(row.json);
    return parsed.success ? parsed.data : null;
  }

  async upsertBrief(prId: string, brief: StoredBrief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: brief })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
  }
}
