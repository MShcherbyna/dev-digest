import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ProjectContextStore, RepoLocation, UsedByRow } from './ports.js';

export class ProjectContextRepository implements ProjectContextStore {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<RepoLocation | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async agentExists(workspaceId: string, agentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return row !== undefined;
  }

  async skillExists(workspaceId: string, skillId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
    return row !== undefined;
  }

  async getAgentPaths(agentId: string, repoId: string): Promise<string[]> {
    const [row] = await this.db
      .select({ paths: t.agentRepoContext.paths })
      .from(t.agentRepoContext)
      .where(and(eq(t.agentRepoContext.agentId, agentId), eq(t.agentRepoContext.repoId, repoId)));
    return row?.paths ?? [];
  }

  /** Upserts ONLY the per-repo list: no version bump, no agent_versions row (AC-23). */
  async setAgentPaths(agentId: string, repoId: string, paths: string[]): Promise<string[]> {
    const [row] = await this.db
      .insert(t.agentRepoContext)
      .values({ agentId, repoId, paths })
      .onConflictDoUpdate({
        target: [t.agentRepoContext.agentId, t.agentRepoContext.repoId],
        set: { paths, updatedAt: new Date() },
      })
      .returning({ paths: t.agentRepoContext.paths });
    return row?.paths ?? paths;
  }

  async getSkillPaths(skillId: string, repoId: string): Promise<string[]> {
    const [row] = await this.db
      .select({ paths: t.skillRepoContext.paths })
      .from(t.skillRepoContext)
      .where(and(eq(t.skillRepoContext.skillId, skillId), eq(t.skillRepoContext.repoId, repoId)));
    return row?.paths ?? [];
  }

  /** Upserts ONLY the per-repo list: no version bump, no skill_versions row (AC-23). */
  async setSkillPaths(skillId: string, repoId: string, paths: string[]): Promise<string[]> {
    const [row] = await this.db
      .insert(t.skillRepoContext)
      .values({ skillId, repoId, paths })
      .onConflictDoUpdate({
        target: [t.skillRepoContext.skillId, t.skillRepoContext.repoId],
        set: { paths, updatedAt: new Date() },
      })
      .returning({ paths: t.skillRepoContext.paths });
    return row?.paths ?? paths;
  }

  async usedByRows(workspaceId: string, repoId: string): Promise<UsedByRow[]> {
    const direct = await this.db
      .select({ agentId: t.agentRepoContext.agentId, paths: t.agentRepoContext.paths })
      .from(t.agentRepoContext)
      .innerJoin(t.agents, eq(t.agentRepoContext.agentId, t.agents.id))
      .where(and(eq(t.agentRepoContext.repoId, repoId), eq(t.agents.workspaceId, workspaceId)));
    // Via skills: enabled globally AND on the agent's link (same rule as the prompt).
    const viaSkills = await this.db
      .select({ agentId: t.agentSkills.agentId, paths: t.skillRepoContext.paths })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .innerJoin(
        t.skillRepoContext,
        and(
          eq(t.skillRepoContext.skillId, t.skills.id),
          eq(t.skillRepoContext.repoId, repoId),
        ),
      )
      .where(
        and(
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
          eq(t.skills.workspaceId, workspaceId),
          eq(t.agents.workspaceId, workspaceId),
        ),
      );
    return [...direct, ...viaSkills];
  }

  async skillPathsFor(skillIds: string[], repoId: string): Promise<Map<string, string[]>> {
    if (skillIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: t.skillRepoContext.skillId, paths: t.skillRepoContext.paths })
      .from(t.skillRepoContext)
      .where(
        and(inArray(t.skillRepoContext.skillId, skillIds), eq(t.skillRepoContext.repoId, repoId)),
      );
    return new Map(rows.map((r) => [r.id, r.paths]));
  }
}
