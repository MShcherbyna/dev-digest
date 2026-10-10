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

  async getAgentPaths(workspaceId: string, agentId: string): Promise<string[] | undefined> {
    const [row] = await this.db
      .select({ paths: t.agents.contextPaths })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return row?.paths;
  }

  /** Writes ONLY `context_paths`: no version bump, no agent_versions row (AC-23). */
  async setAgentPaths(
    workspaceId: string,
    agentId: string,
    paths: string[],
  ): Promise<string[] | undefined> {
    const [row] = await this.db
      .update(t.agents)
      .set({ contextPaths: paths })
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)))
      .returning({ paths: t.agents.contextPaths });
    return row?.paths;
  }

  async getSkillPaths(workspaceId: string, skillId: string): Promise<string[] | undefined> {
    const [row] = await this.db
      .select({ paths: t.skills.contextPaths })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
    return row?.paths;
  }

  /** Writes ONLY `context_paths`: no version bump, no skill_versions row (AC-23). */
  async setSkillPaths(
    workspaceId: string,
    skillId: string,
    paths: string[],
  ): Promise<string[] | undefined> {
    const [row] = await this.db
      .update(t.skills)
      .set({ contextPaths: paths })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)))
      .returning({ paths: t.skills.contextPaths });
    return row?.paths;
  }

  async usedByRows(workspaceId: string): Promise<UsedByRow[]> {
    const direct = await this.db
      .select({ agentId: t.agents.id, paths: t.agents.contextPaths })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId));
    // Via skills: enabled globally AND on the agent's link (same rule as the prompt).
    const viaSkills = await this.db
      .select({ agentId: t.agentSkills.agentId, paths: t.skills.contextPaths })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
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

  async skillPathsFor(skillIds: string[]): Promise<Map<string, string[]>> {
    if (skillIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: t.skills.id, paths: t.skills.contextPaths })
      .from(t.skills)
      .where(inArray(t.skills.id, skillIds));
    return new Map(rows.map((r) => [r.id, r.paths]));
  }
}
