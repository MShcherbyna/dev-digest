import { and, desc, eq, gte, inArray, or, sql, type SQL } from 'drizzle-orm';
import { CiPostAs, CiRunStatus, CiTrigger, Verdict, type CiRun, type CiRunsQuery } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  CiStore,
  IngestWrite,
  InstallationRecord,
  InstallationUpsert,
  LocalPr,
  MemoryExportItem,
  RepoRecord,
  StoredRunRef,
} from './ports.js';

/**
 * Data access of the ci module. Tenancy: installations are reached through
 * their agent (`agents.workspace_id`); runs carry their own `workspace_id`.
 * Rows never leave this file — mappers return the port/shared types.
 */

type CiRunRow = typeof t.ciRuns.$inferSelect;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function parseStatus(v: string | null): CiRunStatus | null {
  const p = CiRunStatus.safeParse(v);
  return p.success ? p.data : null;
}

function toRecord(row: {
  ci: typeof t.ciInstallations.$inferSelect;
  agentName: string;
  agentVersion: number;
}): InstallationRecord {
  const { ci } = row;
  const postAs = CiPostAs.safeParse(ci.postAs);
  return {
    id: ci.id,
    agentId: ci.agentId,
    agentName: row.agentName,
    agentVersion: row.agentVersion,
    repo: ci.repo,
    targetType: ci.targetType,
    installedAt: ci.installedAt,
    agentSlug: ci.agentSlug,
    mode: ci.mode,
    manifestVersion: ci.manifestVersion,
    postAs: postAs.success ? postAs.data : 'github_review',
    triggers: ci.triggers.filter((x): x is CiTrigger => CiTrigger.safeParse(x).success),
    skillSlugs: ci.skillSlugs,
    prUrl: ci.prUrl,
    removalPrUrl: ci.removalPrUrl,
    lastRunAt: ci.lastRunAt,
    lastRunStatus: parseStatus(ci.lastRunStatus),
  };
}

function toRun(row: CiRunRow): CiRun {
  const verdict = Verdict.safeParse(row.verdict);
  return {
    id: row.id,
    ci_installation_id: row.ciInstallationId,
    pr_number: row.prNumber,
    ran_at: iso(row.ranAt),
    status: parseStatus(row.status),
    findings_count: row.findingsCount,
    cost_usd: row.costUsd,
    github_url: row.githubUrl,
    source: row.source,
    agent: row.agentName,
    duration_s: row.durationMs === null ? null : row.durationMs / 1000,
    repo: row.repo,
    pr_title: row.prTitle,
    verdict: verdict.success ? verdict.data : null,
    critical: row.critical,
    warning: row.warning,
    suggestion: row.suggestion,
    job_url: row.githubUrl,
    agent_id: row.agentId,
    agent_slug: row.agentSlug ?? '',
    github_run_id: row.githubRunId === null ? '' : String(row.githubRunId),
    duration_ms: row.durationMs,
    agent_run_id: row.agentRunId,
  };
}

export class CiRepository implements CiStore {
  constructor(private db: Db) {}

  // ---- reads for the generator -------------------------------------------

  async repoForWorkspace(workspaceId: string, fullName: string): Promise<RepoRecord | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, fullName: t.repos.fullName, defaultBranch: t.repos.defaultBranch })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), sql`lower(${t.repos.fullName}) = lower(${fullName})`));
    return row;
  }

  /** Only kind/scope/content are read: embeddings, ids and sources never leave the table. */
  async memoryForExport(workspaceId: string, repoId: string): Promise<MemoryExportItem[]> {
    const rows = await this.db
      .select({ kind: t.memory.kind, scope: t.memory.scope, content: t.memory.content })
      .from(t.memory)
      .where(
        and(
          eq(t.memory.workspaceId, workspaceId),
          or(eq(t.memory.scope, 'global'), and(eq(t.memory.scope, 'repo'), eq(t.memory.repoId, repoId))),
        ),
      )
      .orderBy(t.memory.createdAt, t.memory.id);
    return rows.flatMap((r) =>
      r.scope === 'global' || r.scope === 'repo' ? [{ kind: r.kind, scope: r.scope, content: r.content }] : [],
    );
  }

  // ---- installations -----------------------------------------------------

  private selectInstallations(workspaceId: string, ...where: (SQL | undefined)[]) {
    return this.db
      .select({ ci: t.ciInstallations, agentName: t.agents.name, agentVersion: t.agents.version })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), ...where))
      .orderBy(t.ciInstallations.installedAt, t.ciInstallations.id);
  }

  async listInstallationsByAgent(workspaceId: string, agentId: string): Promise<InstallationRecord[]> {
    return (await this.selectInstallations(workspaceId, eq(t.ciInstallations.agentId, agentId))).map(toRecord);
  }

  async listInstallationsByRepo(workspaceId: string, repo: string): Promise<InstallationRecord[]> {
    return (await this.selectInstallations(workspaceId, eq(t.ciInstallations.repo, repo))).map(toRecord);
  }

  async listInstallations(workspaceId: string, agentId?: string): Promise<InstallationRecord[]> {
    const rows = await this.selectInstallations(
      workspaceId,
      eq(t.ciInstallations.targetType, 'gha'),
      agentId ? eq(t.ciInstallations.agentId, agentId) : undefined,
    );
    return rows.map(toRecord);
  }

  async getInstallation(workspaceId: string, id: string): Promise<InstallationRecord | undefined> {
    const [row] = await this.selectInstallations(workspaceId, eq(t.ciInstallations.id, id));
    return row ? toRecord(row) : undefined;
  }

  async upsertInstallation(workspaceId: string, input: InstallationUpsert): Promise<InstallationRecord> {
    const fields = {
      agentSlug: input.agentSlug,
      mode: input.mode,
      manifestVersion: input.manifestVersion,
      postAs: input.postAs,
      triggers: input.triggers,
      skillSlugs: input.skillSlugs,
      prUrl: input.prUrl,
      // A fresh export supersedes any pending removal; last_run_* is kept.
      removalPrUrl: null,
      updatedAt: new Date(),
    };
    const [row] = await this.db
      .insert(t.ciInstallations)
      .values({ agentId: input.agentId, repo: input.repo, targetType: 'gha', ...fields })
      .onConflictDoUpdate({ target: [t.ciInstallations.agentId, t.ciInstallations.repo], set: fields })
      .returning({ id: t.ciInstallations.id });
    const stored = await this.getInstallation(workspaceId, row!.id);
    return stored!;
  }

  async setRemovalPr(id: string, url: string): Promise<void> {
    await this.db
      .update(t.ciInstallations)
      .set({ removalPrUrl: url, updatedAt: new Date() })
      .where(eq(t.ciInstallations.id, id));
  }

  async clearRemovalPr(id: string): Promise<void> {
    await this.db
      .update(t.ciInstallations)
      .set({ removalPrUrl: null, updatedAt: new Date() })
      .where(eq(t.ciInstallations.id, id));
  }

  /** CI runs and agent_runs are kept: ci_runs.ci_installation_id is `on delete set null`. */
  async deleteInstallation(id: string): Promise<void> {
    await this.db.delete(t.ciInstallations).where(eq(t.ciInstallations.id, id));
  }

  async setLastRun(id: string, at: Date, status: CiRunStatus): Promise<void> {
    await this.db
      .update(t.ciInstallations)
      .set({ lastRunAt: at, lastRunStatus: status, updatedAt: new Date() })
      .where(eq(t.ciInstallations.id, id));
  }

  // ---- runs --------------------------------------------------------------

  async listRuns(workspaceId: string, q: CiRunsQuery): Promise<CiRun[]> {
    const rows = await this.db
      .select()
      .from(t.ciRuns)
      .where(
        and(
          eq(t.ciRuns.workspaceId, workspaceId),
          q.agent ? eq(t.ciRuns.agentId, q.agent) : undefined,
          q.repo ? eq(t.ciRuns.repo, q.repo) : undefined,
          q.status ? eq(t.ciRuns.status, q.status) : undefined,
          q.source ? eq(t.ciRuns.source, q.source) : undefined,
          q.since ? gte(t.ciRuns.ranAt, new Date(q.since)) : undefined,
        ),
      )
      .orderBy(sql`${t.ciRuns.ranAt} desc nulls last`, desc(t.ciRuns.id))
      .limit(q.limit);
    return rows.map(toRun);
  }

  async oldestRunningRunAt(installationId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ at: sql<Date | null>`min(${t.ciRuns.ranAt})` })
      .from(t.ciRuns)
      .where(and(eq(t.ciRuns.ciInstallationId, installationId), eq(t.ciRuns.status, 'running')));
    return row?.at ? new Date(row.at) : null;
  }

  async lastTerminalRunAt(installationId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ at: sql<Date | null>`max(${t.ciRuns.ranAt})` })
      .from(t.ciRuns)
      .where(
        and(
          eq(t.ciRuns.ciInstallationId, installationId),
          inArray(t.ciRuns.status, ['succeeded', 'failed', 'no_findings']),
        ),
      );
    return row?.at ? new Date(row.at) : null;
  }

  async findRun(workspaceId: string, githubRunId: number, agentSlug: string): Promise<StoredRunRef | undefined> {
    const [row] = await this.db
      .select({ id: t.ciRuns.id, agentRunId: t.ciRuns.agentRunId, status: t.ciRuns.status })
      .from(t.ciRuns)
      .where(
        and(
          eq(t.ciRuns.workspaceId, workspaceId),
          eq(t.ciRuns.githubRunId, githubRunId),
          eq(t.ciRuns.agentSlug, agentSlug),
        ),
      );
    return row ? { id: row.id, agentRunId: row.agentRunId, status: parseStatus(row.status) } : undefined;
  }

  async prFor(workspaceId: string, repo: string, prNumber: number): Promise<LocalPr | undefined> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id, title: t.pullRequests.title })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.pullRequests.repoId, t.repos.id))
      .where(
        and(
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.pullRequests.number, prNumber),
          sql`lower(${t.repos.fullName}) = lower(${repo})`,
        ),
      );
    return row;
  }

  /**
   * One transaction. The ci_runs upsert comes first so its row lock serializes a
   * concurrent ingest of the same (run, slug): the second sees `agent_run_id`
   * already set and writes no second agent_runs/run_traces pair (AC-22).
   */
  async ingestRun(w: IngestWrite): Promise<void> {
    const c = w.ciRun;
    const fields = {
      ciInstallationId: w.installationId,
      prNumber: c.prNumber,
      ranAt: c.ranAt,
      status: c.status,
      findingsCount: c.findingsCount,
      costUsd: c.costUsd,
      githubUrl: c.jobUrl,
      source: 'ci',
      agentId: c.agentId,
      agentName: c.agentName,
      repo: c.repo,
      prTitle: c.prTitle,
      verdict: c.verdict,
      critical: c.critical,
      warning: c.warning,
      suggestion: c.suggestion,
      blockers: c.blockers,
      durationMs: c.durationMs,
    };
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.ciRuns)
        .values({ ...fields, workspaceId: w.workspaceId, githubRunId: c.githubRunId, agentSlug: c.agentSlug })
        .onConflictDoUpdate({ target: [t.ciRuns.githubRunId, t.ciRuns.agentSlug], set: fields })
        .returning({ id: t.ciRuns.id, agentRunId: t.ciRuns.agentRunId });
      if (!row || row.agentRunId || !w.agentRun) return;
      const a = w.agentRun;
      const [run] = await tx
        .insert(t.agentRuns)
        .values({
          workspaceId: w.workspaceId,
          agentId: c.agentId,
          prId: a.prId,
          ranAt: a.ranAt,
          provider: a.provider,
          model: a.model,
          durationMs: a.durationMs,
          costUsd: a.costUsd,
          status: a.status,
          error: a.error,
          source: 'ci',
          findingsCount: a.findingsCount,
          blockers: a.blockers,
        })
        .returning({ id: t.agentRuns.id });
      if (w.trace) await tx.insert(t.runTraces).values({ runId: run!.id, trace: w.trace });
      await tx.update(t.ciRuns).set({ agentRunId: run!.id }).where(eq(t.ciRuns.id, row.id));
    });
  }
}
