import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import { DEFAULT_AGENT_DESCRIPTION, INITIAL_AGENT_VERSION } from './constants.js';
import { isConfigChange } from './helpers.js';

/**
 * A2 — agents data-access. Owns `agents`, `agent_versions`, and the
 * `agent_skills` link table (shared with A1's skills repository, but A2 owns the
 * agent side: link/reorder/list for an agent). Workspace-scoped throughout.
 */

import type { AgentRow, AgentVersionRow } from '../../db/rows.js';
export type { AgentRow, AgentVersionRow };

export interface InsertAgent {
  workspaceId: string;
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
  createdBy?: string | null;
}

export interface UpdateAgent {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
}

/** A skill linked to an agent (with its order), joined from agent_skills. */
export interface LinkedSkillRow {
  skill: typeof t.skills.$inferSelect;
  order: number;
  enabled: boolean;
}

/** One desired agent→skill link; `order` defaults to list index, `enabled` to true. */
export interface SkillLinkInput {
  skillId: string;
  order?: number;
  enabled?: boolean;
}

/** A successful run of an agent with the trace fragments the Stats tab reads. */
export interface AgentRunStatRow {
  runId: string;
  ranAt: Date;
  costUsd: number | null;
  durationMs: number | null;
  /** run_traces.trace->'prompt_assembly'->>'skills' (null when no trace / no skills). */
  skillsText: string | null;
  /** run_traces.trace->'memory_pulled' (untrusted jsonb; validated in helpers). */
  memoryPulled: unknown;
}

/** A finding produced by one of those runs (via reviews.run_id). */
export interface AgentFindingStatRow {
  runId: string;
  category: string;
  severity: string;
  accepted: boolean;
}

/** One row of the "recent runs" table, PR joined in (null when the PR is gone). */
export interface AgentRecentRunRow {
  runId: string;
  ranAt: Date;
  prNumber: number | null;
  repoId: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  source: 'local' | 'ci';
}

export class AgentsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<AgentRow[]> {
    return this.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
  }

  async listEnabled(workspaceId: string): Promise<AgentRow[]> {
    return this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
  }

  async getById(workspaceId: string, id: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row;
  }

  /** Delete an agent (scoped to workspace). Versions/skill-links cascade;
   *  agent_runs keep their history with agent_id set null. Returns false if
   *  no such agent existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning({ id: t.agents.id });
    return rows.length > 0;
  }

  /** Insert an agent AND record version 1 in agent_versions (immutable snapshot). */
  async insert(values: InsertAgent): Promise<AgentRow> {
    const [row] = await this.db
      .insert(t.agents)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? DEFAULT_AGENT_DESCRIPTION,
        provider: values.provider,
        model: values.model,
        systemPrompt: values.systemPrompt,
        outputSchema: (values.outputSchema as object | undefined) ?? null,
        ...(values.strategy !== undefined ? { strategy: values.strategy } : {}),
        ...(values.ciFailOn !== undefined ? { ciFailOn: values.ciFailOn } : {}),
        ...(values.repoIntel !== undefined ? { repoIntel: values.repoIntel } : {}),
        enabled: values.enabled ?? true,
        version: INITIAL_AGENT_VERSION,
        createdBy: values.createdBy ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_AGENT_VERSION);
    return row!;
  }

  /**
   * Update an agent. Any config change bumps the version and snapshots the new
   * config into agent_versions (reproducibility for eval).
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgent,
  ): Promise<AgentRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    // A config-affecting change (anything except just toggling enabled) bumps version.
    const configChanged = isConfigChange(existing, patch);
    const nextVersion = configChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.agents)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
        ...(patch.model !== undefined ? { model: patch.model } : {}),
        ...(patch.systemPrompt !== undefined ? { systemPrompt: patch.systemPrompt } : {}),
        ...(patch.outputSchema !== undefined
          ? { outputSchema: patch.outputSchema as object }
          : {}),
        ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
        ...(patch.ciFailOn !== undefined ? { ciFailOn: patch.ciFailOn } : {}),
        ...(patch.repoIntel !== undefined ? { repoIntel: patch.repoIntel } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(configChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning();

    if (configChanged && row) await this.snapshotVersion(row, nextVersion);
    return row;
  }

  private async snapshotVersion(row: AgentRow, version: number): Promise<void> {
    // Only skills enabled on the link are part of the config snapshot.
    const links = await this.linkedSkills(row.id);
    const skills = links.filter((l) => l.enabled).map((l) => l.skill.id);
    await this.db
      .insert(t.agentVersions)
      .values({
        agentId: row.id,
        version,
        configJson: {
          provider: row.provider,
          model: row.model,
          system_prompt: row.systemPrompt,
          output_schema: row.outputSchema,
          strategy: row.strategy,
          ci_fail_on: row.ciFailOn,
          repo_intel: row.repoIntel,
          skills,
        },
      })
      .onConflictDoNothing();
  }

  // ---- agent_versions (immutable config snapshots) ------------------------

  /** All config snapshots for an agent, newest version first. */
  async listVersions(agentId: string): Promise<AgentVersionRow[]> {
    return this.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId))
      .orderBy(desc(t.agentVersions.version));
  }

  /** A single config snapshot, or undefined if that version was never recorded. */
  async getVersion(agentId: string, version: number): Promise<AgentVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
    return row;
  }

  // ---- agent_skills link table (A2 owns the agent side) -------------------

  /** Skills linked to an agent, in `order` ascending. */
  async linkedSkills(agentId: string): Promise<LinkedSkillRow[]> {
    const rows = await this.db
      .select({ skill: t.skills, order: t.agentSkills.order, enabled: t.agentSkills.enabled })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({ skill: r.skill, order: r.order, enabled: r.enabled }));
  }

  async skillIdsForAgent(agentId: string): Promise<string[]> {
    const links = await this.linkedSkills(agentId);
    return links.map((l) => l.skill.id);
  }

  /** Which of `skillIds` exist in the given workspace (tenancy check for bindings). */
  async existingSkillIds(workspaceId: string, skillIds: string[]): Promise<Set<string>> {
    if (skillIds.length === 0) return new Set();
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, skillIds)));
    return new Set(rows.map((r) => r.id));
  }

  /**
   * Link a skill to an agent at a given order (idempotent: upserts order, and
   * `enabled` only when provided so re-ordering never flips a per-agent switch).
   */
  async linkSkill(
    agentId: string,
    skillId: string,
    order: number,
    enabled?: boolean,
  ): Promise<void> {
    await this.db
      .insert(t.agentSkills)
      .values({ agentId, skillId, order, enabled: enabled ?? true })
      .onConflictDoUpdate({
        target: [t.agentSkills.agentId, t.agentSkills.skillId],
        set: { order, ...(enabled !== undefined ? { enabled } : {}) },
      });
  }

  async unlinkSkill(agentId: string, skillId: string): Promise<void> {
    await this.db
      .delete(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.skillId, skillId)));
  }

  /**
   * Replace the full set of linked skills for an agent, in the given order.
   * Used by the "Skills" editor tab (attach/reorder/toggle). Skills not in the
   * list are unlinked.
   */
  async setSkills(agentId: string, links: SkillLinkInput[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
      if (links.length === 0) return;
      await tx.insert(t.agentSkills).values(
        links.map((l, i) => ({
          agentId,
          skillId: l.skillId,
          order: l.order ?? i,
          enabled: l.enabled ?? true,
        })),
      );
    });
  }

  // ---- usage (stats) ------------------------------------------------------

  /**
   * Successful (`done`) runs of one agent since `since`, workspace-scoped, with
   * the trace fragments the Stats tab needs (one LEFT JOIN query — runs
   * without a trace still count).
   */
  async recentDoneRuns(
    workspaceId: string,
    agentId: string,
    since: Date,
  ): Promise<AgentRunStatRow[]> {
    return this.db
      .select({
        runId: t.agentRuns.id,
        ranAt: t.agentRuns.ranAt,
        costUsd: t.agentRuns.costUsd,
        durationMs: t.agentRuns.durationMs,
        skillsText: sql<string | null>`${t.runTraces.trace}->'prompt_assembly'->>'skills'`,
        memoryPulled: sql<unknown>`${t.runTraces.trace}->'memory_pulled'`,
      })
      .from(t.agentRuns)
      .leftJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.agentId, agentId),
          eq(t.agentRuns.status, 'done'),
          gte(t.agentRuns.ranAt, since),
        ),
      );
  }

  /** Mean non-null cost of done runs in [from, to), or null when none has a cost. */
  async avgCostBetween(
    workspaceId: string,
    agentId: string,
    from: Date,
    to: Date,
  ): Promise<number | null> {
    const [row] = await this.db
      .select({ avg: sql<string | null>`avg(${t.agentRuns.costUsd})` })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.agentId, agentId),
          eq(t.agentRuns.status, 'done'),
          gte(t.agentRuns.ranAt, from),
          lt(t.agentRuns.ranAt, to),
        ),
      );
    return row?.avg == null ? null : Number(row.avg);
  }

  /** Findings (kind='finding') produced by the given runs (via reviews.run_id). */
  async findingsForRuns(runIds: string[]): Promise<AgentFindingStatRow[]> {
    if (runIds.length === 0) return [];
    return this.db
      .select({
        runId: sql<string>`${t.reviews.runId}`,
        category: t.findings.category,
        severity: t.findings.severity,
        accepted: sql<boolean>`${t.findings.acceptedAt} is not null`,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(inArray(t.reviews.runId, runIds), eq(t.findings.kind, 'finding')));
  }

  /** Latest done runs of the agent (newest first) with their PR joined in. */
  async latestDoneRuns(
    workspaceId: string,
    agentId: string,
    limit: number,
  ): Promise<AgentRecentRunRow[]> {
    return this.db
      .select({
        runId: t.agentRuns.id,
        ranAt: t.agentRuns.ranAt,
        prNumber: t.pullRequests.number,
        repoId: t.pullRequests.repoId,
        tokensIn: t.agentRuns.tokensIn,
        tokensOut: t.agentRuns.tokensOut,
        costUsd: t.agentRuns.costUsd,
        source: t.agentRuns.source,
      })
      .from(t.agentRuns)
      .leftJoin(t.pullRequests, eq(t.pullRequests.id, t.agentRuns.prId))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.agentId, agentId),
          eq(t.agentRuns.status, 'done'),
        ),
      )
      .orderBy(desc(t.agentRuns.ranAt), desc(t.agentRuns.id))
      .limit(limit);
  }

  /** Finding (kind='finding') count per run id, in one grouped query. */
  async findingCountsByRun(runIds: string[]): Promise<Map<string, number>> {
    if (runIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        runId: sql<string>`${t.reviews.runId}`,
        n: sql<number>`count(*)::int`,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(inArray(t.reviews.runId, runIds), eq(t.findings.kind, 'finding')))
      .groupBy(t.reviews.runId);
    return new Map(rows.map((r) => [r.runId, r.n]));
  }
}
