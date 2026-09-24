import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  IntentPullReader,
  IntentPullWithRepo,
  IntentRecord,
  IntentStore,
  SourceRef,
} from './ports.js';

type Row = typeof t.prIntent.$inferSelect;

function toRecord(row: Row): IntentRecord {
  return {
    prId: row.prId,
    intent: row.intent,
    inScope: row.inScope,
    outOfScope: row.outOfScope,
    riskAreas: row.riskAreas,
    confidence: row.confidence,
    sources: row.sources as SourceRef[],
    headSha: row.headSha,
    inputHash: row.inputHash,
    trigger: row.trigger,
    provider: row.provider,
    model: row.model,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    costUsd: row.costUsd,
    derivedAt: row.derivedAt,
  };
}

function toValues(r: IntentRecord): typeof t.prIntent.$inferInsert {
  return { ...r };
}

/** Owns `pr_intent`. Also serves the workspace-scoped PR reads the intent service needs. */
export class IntentRepository implements IntentStore, IntentPullReader {
  constructor(private db: Db) {}

  async get(prId: string): Promise<IntentRecord | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    return row ? toRecord(row) : undefined;
  }

  /** `ON CONFLICT DO NOTHING` on the pr_id PK, then re-select: the first writer wins. */
  async insertIfAbsent(record: IntentRecord): Promise<IntentRecord> {
    await this.db
      .insert(t.prIntent)
      .values(toValues(record))
      .onConflictDoNothing({ target: t.prIntent.prId });
    const stored = await this.get(record.prId);
    return stored ?? record;
  }

  async upsert(record: IntentRecord): Promise<IntentRecord> {
    const values = toValues(record);
    const { prId: _prId, ...set } = values;
    await this.db
      .insert(t.prIntent)
      .values(values)
      .onConflictDoUpdate({ target: t.prIntent.prId, set });
    return record;
  }

  async getPullWithRepo(workspaceId: string, prId: string): Promise<IntentPullWithRepo | undefined> {
    const [row] = await this.db
      .select({ pull: t.pullRequests, owner: t.repos.owner, name: t.repos.name })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;
    const p = row.pull;
    return {
      pull: {
        id: p.id,
        number: p.number,
        title: p.title,
        branch: p.branch,
        base: p.base,
        headSha: p.headSha,
        body: p.body,
      },
      repo: { owner: row.owner, name: row.name },
    };
  }

  async listPrFiles(prId: string): Promise<{ path: string; patch: string | null }[]> {
    return this.db
      .select({ path: t.prFiles.path, patch: t.prFiles.patch })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  async listPrCommits(prId: string): Promise<{ message: string }[]> {
    return this.db
      .select({ message: t.prCommits.message })
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId));
  }
}
