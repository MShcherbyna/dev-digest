import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { INSERT_BATCH } from './constants.js';
import type {
  ContextIndexStore,
  ProjectContextStore,
  RepoLocation,
  UsedByRow,
} from './ports.js';
import type {
  FailureReason,
  IndexBuild,
  IndexStateRecord,
  ManifestEntry,
} from './types.js';

function batches<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += INSERT_BATCH) out.push(rows.slice(i, i + INSERT_BATCH));
  return out;
}

export class ProjectContextRepository implements ProjectContextStore, ContextIndexStore {
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

  async readListing(
    repoId: string,
  ): Promise<{ state: IndexStateRecord | undefined; files: ManifestEntry[] }> {
    // One snapshot across both statements, so a concurrent swap can't mix old and new.
    return this.db.transaction(
      async (tx) => {
        const [state] = await tx
          .select()
          .from(t.contextIndexState)
          .where(eq(t.contextIndexState.repoId, repoId));
        const rows = await tx
          .select()
          .from(t.contextFiles)
          .where(eq(t.contextFiles.repoId, repoId))
          .orderBy(asc(t.contextFiles.path));
        return {
          state: state && {
            status: state.status,
            indexedAt: state.indexedAt,
            indexedSha: state.indexedSha,
            glob: state.glob,
            files: state.files,
            chunks: state.chunks,
            truncated: state.truncated,
            total: state.total,
            failedAt: state.failedAt,
            failureReason: state.failureReason,
          },
          files: rows.map((r) => ({
            path: r.path,
            type: r.type as ManifestEntry['type'],
            size: r.size,
            tokens: r.tokens,
            contentHash: r.contentHash,
            tooLarge: r.tooLarge,
            unreadable: r.unreadable,
            empty: r.empty,
          })),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async replaceIndex(
    repoId: string,
    build: IndexBuild,
    indexedAt: Date,
    assertNotCancelled: () => void,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Chunks go with their files (ON DELETE CASCADE).
      await tx.delete(t.contextFiles).where(eq(t.contextFiles.repoId, repoId));

      const idByPath = new Map<string, string>();
      for (const batch of batches(build.files)) {
        const inserted = await tx
          .insert(t.contextFiles)
          .values(
            batch.map((f) => ({
              repoId,
              path: f.path,
              type: f.type,
              size: f.size,
              tokens: f.tokens,
              contentHash: f.contentHash,
              tooLarge: f.tooLarge,
              unreadable: f.unreadable,
              empty: f.empty,
            })),
          )
          .returning({ id: t.contextFiles.id, path: t.contextFiles.path });
        for (const r of inserted) idByPath.set(r.path, r.id);
      }

      const chunkRows = build.files.flatMap((f) =>
        f.chunks.map((c) => ({
          fileId: idByPath.get(f.path)!,
          repoId,
          ordinal: c.ordinal,
          breadcrumb: c.breadcrumb,
          startOffset: c.startOffset,
          endOffset: c.endOffset,
          tokens: c.tokens,
          text: c.text,
          contentHash: c.contentHash,
        })),
      );
      for (const batch of batches(chunkRows)) await tx.insert(t.contextChunks).values(batch);

      const values = {
        status: 'ready' as const,
        indexedAt,
        indexedSha: build.indexedSha,
        glob: build.glob,
        files: build.files.length,
        chunks: chunkRows.length,
        truncated: build.truncated,
        total: build.total,
        failedAt: null,
        failureReason: null,
        updatedAt: new Date(),
      };
      await tx
        .insert(t.contextIndexState)
        .values({ repoId, ...values })
        .onConflictDoUpdate({ target: t.contextIndexState.repoId, set: values });

      // Last statement: a build abandoned by the job timeout rolls back.
      assertNotCancelled();
    });
  }

  async recordFailure(repoId: string, failedAt: Date, reason: FailureReason): Promise<void> {
    const set = { status: 'failed' as const, failedAt, failureReason: reason, updatedAt: new Date() };
    await this.db
      .insert(t.contextIndexState)
      .values({ repoId, ...set })
      .onConflictDoUpdate({ target: t.contextIndexState.repoId, set });
  }
}
