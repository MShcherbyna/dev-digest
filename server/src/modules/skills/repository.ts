import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { INITIAL_SKILL_VERSION } from './constants.js';

/**
 * Skills data-access. Owns `skills` + `skill_versions`; reads `agent_skills`,
 * `agent_runs`, `run_traces`, `reviews` and `findings` for usage stats only.
 * Workspace-scoped throughout.
 */

export type SkillRow = typeof t.skills.$inferSelect;
export type SkillVersionRow = typeof t.skillVersions.$inferSelect;

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

/** An agent bound to a skill (any per-agent `enabled`). */
export interface SkillBinding {
  skillId: string;
  agentId: string;
  agentName: string;
}

/** A recent run of a bound agent with the skills text it was assembled with. */
export interface RunSkillsRow {
  runId: string;
  agentId: string;
  skillsText: string | null;
}

export interface RunFindingRow {
  runId: string;
  category: string;
  accepted: boolean;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Insert a skill AND its version-1 body row atomically. */
  async insert(values: InsertSkill): Promise<SkillRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({ ...values, version: INITIAL_SKILL_VERSION })
        .returning();
      await tx
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: INITIAL_SKILL_VERSION, body: row!.body });
      return row!;
    });
  }

  /** Apply a patch, bump `version` and record the resulting body as a new version row. */
  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRow | undefined> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .for('update');
      if (!existing) return undefined;
      const nextVersion = existing.version + 1;
      const [row] = await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          version: nextVersion,
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();
      await tx
        .insert(t.skillVersions)
        .values({ skillId: id, version: nextVersion, body: row!.body });
      return row;
    });
  }

  /** Delete a skill; `agent_skills` and `skill_versions` cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  // ---- usage (stats) ------------------------------------------------------

  /** Agent bindings for the given skills, workspace-scoped. */
  async bindings(workspaceId: string, skillIds: string[]): Promise<SkillBinding[]> {
    if (skillIds.length === 0) return [];
    return this.db
      .select({
        skillId: t.agentSkills.skillId,
        agentId: t.agentSkills.agentId,
        agentName: t.agents.name,
      })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.skills.workspaceId, workspaceId),
          inArray(t.agentSkills.skillId, skillIds),
        ),
      )
      .orderBy(asc(t.agents.name));
  }

  /** Successful runs of the given agents since `since`, with their assembled skills text. */
  async recentRuns(workspaceId: string, agentIds: string[], since: Date): Promise<RunSkillsRow[]> {
    if (agentIds.length === 0) return [];
    const rows = await this.db
      .select({
        runId: t.agentRuns.id,
        agentId: t.agentRuns.agentId,
        skillsText: sql<string | null>`${t.runTraces.trace}->'prompt_assembly'->>'skills'`,
      })
      .from(t.agentRuns)
      .leftJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          inArray(t.agentRuns.agentId, agentIds),
          eq(t.agentRuns.status, 'done'),
          gte(t.agentRuns.ranAt, since),
        ),
      );
    return rows.map((r) => ({ runId: r.runId, agentId: r.agentId!, skillsText: r.skillsText }));
  }

  /** Findings produced by the given runs (via reviews.run_id). */
  async findingsForRuns(runIds: string[]): Promise<RunFindingRow[]> {
    if (runIds.length === 0) return [];
    const rows = await this.db
      .select({
        runId: t.reviews.runId,
        category: t.findings.category,
        accepted: sql<boolean>`${t.findings.acceptedAt} is not null`,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(inArray(t.reviews.runId, runIds), eq(t.findings.kind, 'finding')));
    return rows.map((r) => ({ runId: r.runId!, category: r.category, accepted: r.accepted }));
  }
}
