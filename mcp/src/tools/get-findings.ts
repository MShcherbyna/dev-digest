import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BusinessError, ok } from '../lib/result.js';
import { guarded, type ToolDeps } from './deps.js';
import {
  buildDoneResult,
  buildPendingResult,
  DEFAULT_FINDINGS_LIMIT,
  failedRunError,
  webUrl,
} from './review-result.js';
import {
  AgentArg,
  CursorArg,
  LimitArg,
  MinSeverityArg,
  PrArg,
  RepoArg,
  ReviewResultShape,
  RunIdArg,
} from './schemas.js';

export function registerGetFindings(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'devdigest_get_findings',
    {
      title: 'Get review findings',
      description:
        'Get the verdict and findings of a DevDigest review run on a pull request (latest run, or one agent\'s latest, by default), paginated.',
      inputSchema: {
        repo: RepoArg,
        pr: PrArg,
        agent: AgentArg.optional(),
        run_id: RunIdArg.optional(),
        min_severity: MinSeverityArg.optional(),
        include_details: z
          .boolean()
          .optional()
          .describe('Include full rationale and suggestion instead of a short excerpt, e.g. true (default false)'),
        limit: LimitArg(DEFAULT_FINDINGS_LIMIT).optional(),
        cursor: CursorArg.optional(),
      },
      outputSchema: ReviewResultShape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    guarded(deps, async ({ repo, pr, agent, run_id, min_severity, include_details, limit, cursor }) => {
      const resolved = await deps.resolver.resolvePr(repo, pr);
      const url = webUrl(deps.config.webUrl, resolved.repo.id, pr);
      return deps.resolver.guardPr(repo, pr, async () => {
        const agentRec = agent ? await deps.resolver.resolveAgent(agent) : null;

        const runs = await deps.gateway.listRuns(resolved.prId);
        let run;
        if (run_id) {
          run = runs.find((r) => r.runId === run_id);
          if (!run) {
            throw new BusinessError({
              what: `Run ${run_id} does not belong to ${resolved.repo.fullName} PR #${pr}`,
              expected: 'a run_id returned by devdigest_run_agent_on_pr for this PR',
              example: 'omit run_id to get the latest run',
              next: 'call devdigest_get_findings without run_id',
            });
          }
        } else {
          // Newest DONE run wins; only when none is done fall back to the newest of any
          // status, so running/failed/cancelled are still reported (a newer failure must
          // not mask an older finished review).
          const mine = runs.filter((r) => !agentRec || r.agentId === agentRec.id);
          run = mine.find((r) => r.status === 'done') ?? mine[0];
        }

        const base = { repo: resolved.repo.fullName, pr, webUrl: url };
        if (!run) {
          return ok(
            buildPendingResult(
              { ...base, run: null, nextStep: 'No runs for this PR yet. Start one with devdigest_run_agent_on_pr.' },
              'none',
            ),
          );
        }
        const status = run.status;
        if (status === 'failed' || status === 'cancelled') throw failedRunError(run);
        if (status !== 'done') {
          return ok(
            buildPendingResult(
              { ...base, run, nextStep: 'The run is still in progress. Call devdigest_get_findings again in ~30s.' },
              'running',
            ),
          );
        }

        const reviews = await deps.gateway.reviewsForPull(resolved.prId);
        const review = reviews.find((r) => r.runId === run.runId);
        return ok(
          buildDoneResult({
            resolved,
            ...base,
            webUrl: url,
            run,
            review,
            limit: limit ?? DEFAULT_FINDINGS_LIMIT,
            cursor,
            minSeverity: min_severity,
            includeDetails: include_details ?? false,
          }),
        );
      });
    }),
  );
}
