import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RunRecord } from '../gateway/ports.js';
import { waitForRun } from '../lib/wait-for-run.js';
import { ok } from '../lib/result.js';
import { guarded, type ToolDeps } from './deps.js';
import {
  buildDoneResult,
  buildPendingResult,
  DEFAULT_FINDINGS_LIMIT,
  failedRunError,
  webUrl,
} from './review-result.js';
import { AgentArg, LimitArg, MinSeverityArg, PrArg, RepoArg, ReviewResultShape } from './schemas.js';

export function registerRunAgentOnPr(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'devdigest_run_agent_on_pr',
    {
      title: 'Run agent review on PR',
      description:
        'Run one DevDigest reviewer agent on a pull request, wait for it, and return its verdict and findings. Each call costs LLM money; if the run outlasts the wait it returns status "running" — then call devdigest_get_findings.',
      inputSchema: {
        repo: RepoArg,
        pr: PrArg,
        agent: AgentArg,
        limit: LimitArg(DEFAULT_FINDINGS_LIMIT).optional(),
        min_severity: MinSeverityArg.optional(),
      },
      outputSchema: ReviewResultShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    guarded(deps, async ({ repo, pr, agent, limit, min_severity }, ctx) => {
      const resolved = await deps.resolver.resolvePr(repo, pr);
      const agentRec = await deps.resolver.resolveAgent(agent);
      const url = webUrl(deps.config.webUrl, resolved.repo.id, pr);
      const prId = resolved.prId;

      return deps.resolver.guardPr(repo, pr, async () => {
        // In-flight dedupe + guard + start are serialized per (PR, agent) so two concurrent
        // calls cannot both start a run (each one costs LLM money).
        const { runId, reused } = await deps.runGuard.withLock(`${prId}:${agentRec.id}`, async () => {
          const active = (await deps.gateway.activeRuns(prId)).find((r) => r.agentId === agentRec.id);
          if (active) return { runId: active.runId, reused: true };
          deps.runGuard.assertCanStart();
          const started = await deps.gateway.startReview(prId, agentRec.id);
          deps.runGuard.recordStart();
          return { runId: started.runId, reused: false };
        });

        // ctx.signal fires on client cancel OR shutdown; either way the wait returns
        // "running" and the server-side run continues (it is never cancelled from here).
        const waited = await waitForRun({
          gateway: deps.gateway,
          prId,
          runId,
          waitMs: deps.config.runWaitMs,
          pollMs: deps.config.pollMs,
          signal: ctx.signal,
          ...(ctx.onProgress ? { onProgress: ctx.onProgress } : {}),
          ...(deps.clock ?? {}),
        });

        const runs = await deps.gateway.listRuns(prId);
        const run: RunRecord = runs.find((r) => r.runId === runId) ?? {
          runId, agentId: agentRec.id, agentName: agentRec.name, status: waited.status, error: waited.error, score: null,
        };
        const base = { repo: resolved.repo.fullName, pr, webUrl: url };

        if (waited.status === 'failed' || waited.status === 'cancelled') {
          throw failedRunError({ ...run, status: waited.status, error: waited.error ?? run.error });
        }
        if (waited.status === 'running') {
          return ok(
            buildPendingResult(
              {
                ...base,
                run,
                nextStep: `Run is still going. Call devdigest_get_findings with repo, pr and run_id "${runId}" in ~30s.${reused ? ' (Attached to an already running review; no new cost.)' : ''}`,
              },
              'running',
            ),
          );
        }

        const review = (await deps.gateway.reviewsForPull(prId)).find((r) => r.runId === runId);
        return ok(
          buildDoneResult({
            resolved,
            ...base,
            run,
            review,
            limit: limit ?? DEFAULT_FINDINGS_LIMIT,
            minSeverity: min_severity,
            includeDetails: false,
            nextStep: reused ? 'Attached to an already running review for this PR and agent; no new run was started.' : null,
          }),
        );
      });
    }),
  );
}
