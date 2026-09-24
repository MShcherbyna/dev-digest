import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  SourceFinding,
  TranslationLanguage,
  TranslationRecord,
  TranslationStore,
} from './ports.js';

type Row = typeof t.findingTranslations.$inferSelect;

function toRecord(row: Row): TranslationRecord {
  return {
    findingId: row.findingId,
    language: row.language as TranslationLanguage,
    provider: row.provider,
    model: row.model,
    sourceHash: row.sourceHash,
    title: row.title,
    rationale: row.rationale,
    suggestion: row.suggestion,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    costUsd: row.costUsd,
    translatedAt: row.translatedAt,
  };
}

/** Owns `finding_translations`; also the workspace-scoped finding read it needs. */
export class TranslationRepository implements TranslationStore {
  constructor(private db: Db) {}

  async findingForWorkspace(
    workspaceId: string,
    findingId: string,
  ): Promise<SourceFinding | undefined> {
    const [row] = await this.db
      .select({
        id: t.findings.id,
        title: t.findings.title,
        rationale: t.findings.rationale,
        suggestion: t.findings.suggestion,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(and(eq(t.findings.id, findingId), eq(t.reviews.workspaceId, workspaceId)));
    return row;
  }

  async find(findingIds: string[], language: TranslationLanguage): Promise<TranslationRecord[]> {
    if (findingIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(t.findingTranslations)
      .where(
        and(
          inArray(t.findingTranslations.findingId, findingIds),
          eq(t.findingTranslations.language, language),
        ),
      );
    return rows.map(toRecord);
  }

  async upsertMany(records: TranslationRecord[]): Promise<void> {
    for (const r of records) {
      const { findingId, language, ...rest } = r;
      await this.db
        .insert(t.findingTranslations)
        .values(r)
        .onConflictDoUpdate({
          target: [t.findingTranslations.findingId, t.findingTranslations.language],
          set: rest,
        });
    }
  }
}
