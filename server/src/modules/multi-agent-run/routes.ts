import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { MULTI_RUN_RATE_LIMIT } from './constants.js';
import {
  LastSelectionResponse,
  MultiRunChildParams,
  MultiRunParams,
  RecentMultiAgentRun,
  RecentMultiAgentRunsQuery,
  StartMultiAgentRunBody,
} from './schemas.js';
import { MultiAgentRunService } from './service.js';

/**
 * multi-agent-run module (SPEC-2026-10-16).
 *   POST /pulls/:id/multi-agent-run                        -> start a run (AC-1)
 *   GET  /multi-agent-runs/:id                              -> one run, by id (AC-2)
 *   GET  /pulls/:id/multi-agent                             -> the PR's latest run (AC-3)
 *   GET  /multi-agent-runs                                   -> the workspace's recent runs (AC-36)
 *   POST /multi-agent-runs/:id/cancel                       -> cancel the whole run (AC-19)
 *   POST /multi-agent-runs/:id/runs/:runId/cancel           -> cancel one child (AC-19)
 *   POST /multi-agent-runs/:id/runs/:runId/retry            -> retry one failed child (AC-19)
 *   GET  /repos/:id/multi-agent/last-selection               -> the workspace's last agent pick for this repo (Q-6)
 *
 * Every route resolves the workspace via `getContext` and returns 404 when
 * the resource belongs to another workspace or doesn't exist (AC-38, NFR-4) —
 * NOTE this module's routes do NOT share the pre-existing workspace-check gap
 * on `GET /runs/:id/trace` / `POST /runs/:id/cancel` (reviews module,
 * untouched by this spec; see `server/INSIGHTS.md`).
 */
export default async function multiAgentRunRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.multiAgentRun;

  app.post(
    '/pulls/:id/multi-agent-run',
    { schema: { params: IdParams, body: StartMultiAgentRunBody }, config: { rateLimit: MULTI_RUN_RATE_LIMIT } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.start(workspaceId, req.params.id, req.body.agent_ids);
    },
  );

  app.get(
    '/multi-agent-runs',
    { schema: { querystring: RecentMultiAgentRunsQuery, response: { 200: RecentMultiAgentRun.array() } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.recent(workspaceId, req.query.limit);
    },
  );

  app.get('/multi-agent-runs/:id', { schema: { params: MultiRunParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.get('/pulls/:id/multi-agent', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.latestForPull(workspaceId, req.params.id);
  });

  app.post('/multi-agent-runs/:id/cancel', { schema: { params: MultiRunParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.cancelAll(workspaceId, req.params.id);
  });

  app.post(
    '/multi-agent-runs/:id/runs/:runId/cancel',
    { schema: { params: MultiRunChildParams } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.cancelChild(workspaceId, req.params.id, req.params.runId);
    },
  );

  app.post(
    '/multi-agent-runs/:id/runs/:runId/retry',
    { schema: { params: MultiRunChildParams }, config: { rateLimit: MULTI_RUN_RATE_LIMIT } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.retryChild(workspaceId, req.params.id, req.params.runId);
    },
  );

  app.get(
    '/repos/:id/multi-agent/last-selection',
    { schema: { params: IdParams, response: { 200: LastSelectionResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const agent_ids = await service.lastSelection(workspaceId, req.params.id);
      return { agent_ids };
    },
  );
}
