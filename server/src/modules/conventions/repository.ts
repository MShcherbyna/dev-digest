import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** Conventions data-access. Owns the `conventions` table; workspace-scoped throughout. */

export type ConventionRow = typeof t.conventions.$inferSelect;
export type InsertConvention = Omit<typeof t.conventions.$inferInsert, 'id' | 'accepted'>;

export class ConventionsRepository {
  constructor(private db: Db) {}

  /** Accepted first (so they stay on top after a re-scan), then most confident; stable tiebreakers. */
  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(
        desc(t.conventions.accepted),
        sql`${t.conventions.confidence} desc nulls last`,
        asc(t.conventions.evidencePath),
        asc(t.conventions.evidenceLine),
        asc(t.conventions.id),
      );
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async getMany(workspaceId: string, repoId: string, ids: string[]): Promise<ConventionRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.id, ids),
        ),
      );
  }

  /** Re-scan: wipe every candidate of the repo (accepted ones included) before storing fresh ones. */
  async deleteAll(workspaceId: string, repoId: string): Promise<void> {
    await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
  }

  async insertMany(values: InsertConvention[]): Promise<ConventionRow[]> {
    if (values.length === 0) return [];
    return this.db.insert(t.conventions).values(values).returning();
  }

  async update(
    workspaceId: string,
    id: string,
    patch: { accepted?: boolean; rule?: string },
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.accepted !== undefined ? { accepted: patch.accepted } : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning({ id: t.conventions.id });
    return rows.length > 0;
  }
}
