import type { Container } from '../../platform/container.js';
import type { Limiter } from '../../platform/limiter.js';
import type { ReviewRunPort } from '../multi-agent-run/ports.js';
import type { ReviewRepository } from './repository.js';
import { ReviewRunExecutor } from './run-executor.js';

/**
 * Implements the multi-agent-run module's `ReviewRunPort` over the reviews
 * module's executor — the ONLY way multi-agent-run reaches review execution
 * (architecture constraint: it must not import `reviews/repository*` or
 * `reviews/run-executor.ts` directly).
 */
export class ReviewRunPortImpl implements ReviewRunPort {
  private executor: ReviewRunExecutor;

  constructor(
    private container: Container,
    private repo: ReviewRepository,
    agents: Container['agentsRepo'],
  ) {
    this.executor = new ReviewRunExecutor(container, repo, agents);
  }

  execute(input: {
    workspaceId: string;
    prId: string;
    jobs: { agentId: string; runId: string }[];
    limiter: Limiter;
  }): void {
    void (async () => {
      const pull = await this.repo.getPull(input.workspaceId, input.prId);
      if (!pull) {
        for (const job of input.jobs) this.container.runBus.complete(job.runId);
        return;
      }
      const repo = await this.repo.getRepo(pull.repoId);
      if (!repo) {
        for (const job of input.jobs) this.container.runBus.complete(job.runId);
        return;
      }
      const agentRows = await Promise.all(
        input.jobs.map((j) => this.container.agentsRepo.getById(input.workspaceId, j.agentId)),
      );
      const jobs = input.jobs
        .map((j, i) => ({ agent: agentRows[i], runId: j.runId }))
        .filter((j): j is { agent: NonNullable<typeof j.agent>; runId: string } => j.agent != null);

      // Background execution — errors are logged, never thrown to the caller
      // (the HTTP response already returned with the created run).
      await this.executor.executeRuns(input.workspaceId, pull, repo, jobs, undefined, {
        limiter: input.limiter,
      });
    })().catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('multi-agent-run: background execution crashed', err);
    });
  }

  async cancel(runId: string): Promise<void> {
    this.container.runBus.publish(runId, 'info', 'Cancellation requested — stopping…');
    this.container.runBus.cancel(runId);
    await this.repo.cancelRunIfRunning(runId);
    this.container.runBus.complete(runId);
  }
}
