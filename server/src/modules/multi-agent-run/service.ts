import { AppError, NotFoundError } from '../../platform/errors.js';
import { createLimiter, type Limiter } from '../../platform/limiter.js';
import { MULTI_AGENT_CONCURRENCY } from './constants.js';
import { applyGroupIds, buildLocations, groupFindings } from './domain/grouping.js';
import { aggregateStatus, latestAttempts, totalCost, wallClockMs } from './domain/run-status.js';
import type { AgentCatalog, MultiRunChildRow, MultiRunStore, PullLookup, ReviewRunPort } from './ports.js';
import type { AgentColumnView, MultiAgentRunView, RecentMultiAgentRun } from './schemas.js';

/**
 * Multi-Agent Review service. Depends only on narrow ports (never
 * `Container` or a concrete repository) — onion-architecture.
 */
export class MultiAgentRunService {
  /** One limiter per multi-run, created lazily and shared across retries so
   * the concurrency bound of `concurrency_limit` holds for the run's whole
   * lifetime. Deleted once the run reaches a terminal aggregate status. */
  private limiters = new Map<string, Limiter>();

  constructor(
    private store: MultiRunStore,
    private runPort: ReviewRunPort,
    private agents: AgentCatalog,
    private pulls: PullLookup,
  ) {}

  private limiterFor(multiRunId: string): Limiter {
    let limiter = this.limiters.get(multiRunId);
    if (!limiter) {
      limiter = createLimiter(MULTI_AGENT_CONCURRENCY);
      this.limiters.set(multiRunId, limiter);
    }
    return limiter;
  }

  async start(workspaceId: string, prId: string, agentIds: string[]): Promise<MultiAgentRunView> {
    const pull = await this.pulls.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const enabled = await this.agents.listEnabled(workspaceId);
    const enabledIds = new Set(enabled.map((a) => a.id));
    if (!agentIds.every((id) => enabledIds.has(id))) {
      throw new AppError('invalid_agents', 'One or more agent ids are not enabled in this workspace', 422);
    }

    const created = await this.store.createWithChildren({
      workspaceId,
      prId,
      agentIds,
      concurrencyLimit: MULTI_AGENT_CONCURRENCY,
    });
    if ('conflict' in created) {
      throw new AppError(
        'multi_run_in_progress',
        'A multi-agent run is already in progress for this pull request',
        409,
      );
    }

    const jobs = await this.jobsFor(created.run.id, agentIds);
    this.runPort.execute({ workspaceId, prId, jobs, limiter: this.limiterFor(created.run.id) });

    return this.get(workspaceId, created.run.id);
  }

  /** Map requested agent ids to their freshly-created child run ids, in order. */
  private async jobsFor(
    multiRunId: string,
    agentIds: string[],
  ): Promise<{ agentId: string; runId: string }[]> {
    const children = await this.store.childrenWithFindings(multiRunId);
    const runIdByAgent = new Map(children.map((c) => [c.agentId, c.runId]));
    return agentIds
      .map((agentId) => ({ agentId, runId: runIdByAgent.get(agentId) }))
      .filter((j): j is { agentId: string; runId: string } => j.runId != null);
  }

  async get(workspaceId: string, id: string): Promise<MultiAgentRunView> {
    const run = await this.store.getById(workspaceId, id);
    if (!run) throw new NotFoundError('Multi-agent run not found');
    return this.buildView(run);
  }

  async latestForPull(workspaceId: string, prId: string): Promise<MultiAgentRunView> {
    const run = await this.store.latestForPull(workspaceId, prId);
    if (!run) throw new NotFoundError('No multi-agent run for this pull request');
    return this.buildView(run);
  }

  /** AC-36: the landing page's recent-runs list, instead of always forcing a
   * new Configure run. */
  async recent(workspaceId: string, limit: number): Promise<RecentMultiAgentRun[]> {
    const rows = await this.store.recent(workspaceId, limit);
    return rows.map((r) => ({
      id: r.id,
      pr_id: r.prId,
      pr_number: r.prNumber,
      pr_title: r.prTitle,
      repo_full_name: r.repoFullName,
      ran_at: r.ranAt.toISOString(),
      agent_count: r.agentCount,
      cancelled: r.cancelledAt != null,
    }));
  }

  private async buildView(run: {
    id: string;
    workspaceId: string;
    prId: string;
    prNumber: number | null;
    ranAt: Date;
    requestedAgentIds: string[];
    cancelledAt: Date | null;
  }): Promise<MultiAgentRunView> {
    const children = await this.store.childrenWithFindings(run.id);
    const latest = latestAttempts(children);
    const latestByAgent = new Map(latest.filter((c) => c.agentId).map((c) => [c.agentId as string, c]));

    // Columns in `requested_agent_ids` order (AC-24's agent order).
    const columnsRaw: AgentColumnView[] = run.requestedAgentIds
      .map((agentId) => latestByAgent.get(agentId))
      .filter((c): c is MultiRunChildRow => c != null)
      .map((c) => this.toColumn(c));

    const { groupIdByFinding, groups } = groupFindings(columnsRaw);
    const columns = applyGroupIds(columnsRaw, groupIdByFinding);
    const conflicts = buildLocations(groups, columns);

    const status = aggregateStatus(children, run.cancelledAt);
    if (status !== 'running') this.limiters.delete(run.id);

    return {
      id: run.id,
      pr_id: run.prId,
      pr_number: run.prNumber,
      ran_at: run.ranAt.toISOString(),
      agent_count: run.requestedAgentIds.length,
      total_duration_ms: wallClockMs(run.ranAt, children),
      total_cost_usd: this.hasAnyCost(children) ? totalCost(children) : null,
      columns,
      conflicts,
      status,
      concurrency_limit: MULTI_AGENT_CONCURRENCY,
      requested_agent_ids: run.requestedAgentIds,
    };
  }

  private hasAnyCost(children: MultiRunChildRow[]): boolean {
    return children.some((c) => c.costUsd != null);
  }

  private toColumn(c: MultiRunChildRow): AgentColumnView {
    return {
      run_id: c.runId,
      agent_id: c.agentId ?? '',
      agent_name: c.agentName ?? '',
      provider: c.provider,
      model: c.model,
      status: c.status,
      verdict: c.verdict,
      score: c.score,
      summary: c.summary,
      duration_ms: c.durationMs,
      cost_usd: c.costUsd,
      findings: c.findings,
    };
  }

  async cancelAll(workspaceId: string, id: string): Promise<MultiAgentRunView> {
    const run = await this.store.getById(workspaceId, id);
    if (!run) throw new NotFoundError('Multi-agent run not found');
    const nonTerminalRunIds = await this.store.markCancelled(id);
    await Promise.all(nonTerminalRunIds.map((runId) => this.runPort.cancel(runId)));
    this.limiters.delete(id);
    return this.get(workspaceId, id);
  }

  async cancelChild(workspaceId: string, id: string, runId: string): Promise<MultiAgentRunView> {
    const run = await this.store.getById(workspaceId, id);
    if (!run) throw new NotFoundError('Multi-agent run not found');
    const children = await this.store.childrenWithFindings(id);
    if (!children.some((c) => c.runId === runId)) {
      throw new NotFoundError('Run does not belong to this multi-agent run');
    }
    await this.runPort.cancel(runId);
    return this.get(workspaceId, id);
  }

  async retryChild(workspaceId: string, id: string, runId: string): Promise<MultiAgentRunView> {
    const run = await this.store.getById(workspaceId, id);
    if (!run) throw new NotFoundError('Multi-agent run not found');
    const children = await this.store.childrenWithFindings(id);
    const latest = latestAttempts(children);
    const target = children.find((c) => c.runId === runId);
    const isLatestForAgent = target && latest.some((l) => l.runId === target.runId);
    if (!target || !isLatestForAgent || target.status !== 'failed' || !target.agentId) {
      throw new AppError('not_retryable', 'Only the latest failed attempt of an agent can be retried', 409);
    }

    const { runId: newRunId, status } = await this.store.insertRetryChild(id, {
      id: target.agentId,
      provider: target.provider,
      model: target.model,
    });
    if (status === 'queued') {
      this.runPort.execute({
        workspaceId,
        prId: run.prId,
        jobs: [{ agentId: target.agentId, runId: newRunId }],
        limiter: this.limiterFor(id),
      });
    }
    return this.get(workspaceId, id);
  }

  /** Q-6: the workspace's last agent selection for this repo, filtered to
   * currently enabled agents. 404 for a repo outside this workspace (AC-38). */
  async lastSelection(workspaceId: string, repoId: string): Promise<string[] | null> {
    const inWorkspace = await this.pulls.repoInWorkspace(workspaceId, repoId);
    if (!inWorkspace) throw new NotFoundError('Repo not found');
    const ids = await this.store.lastSelectionForRepo(workspaceId, repoId);
    if (!ids || ids.length === 0) return null;
    const enabled = await this.agents.listEnabled(workspaceId);
    const enabledIds = new Set(enabled.map((a) => a.id));
    const filtered = ids.filter((id) => enabledIds.has(id));
    return filtered.length > 0 ? filtered : null;
  }
}
