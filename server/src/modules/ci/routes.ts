import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CI_EXPORT_BODY_LIMIT_BYTES, CI_RATE_LIMIT } from './constants.js';
import type { CiLog } from './ports.js';
import {
  CiExport,
  CiExportInput,
  CiInstallationList,
  CiPreview,
  CiPreviewInput,
  CiRefreshInput,
  CiRefreshResult,
  CiRemoveResult,
  CiRunList,
  CiRunsQuery,
  RemoveBody,
} from './schemas.js';

/**
 * Export to CI. Routes only parse, call one service method and set the status;
 * rules and error mapping live in `service.ts` / `ingest.ts`.
 *   POST /agents/:id/ci/preview          generated files + secret status (never fails on GitHub)
 *   POST /agents/:id/export-ci           open the devdigest/ci PR, or record a manual (zip) install
 *   GET  /agents/:id/ci/installations    the CI tab rows (status derived)
 *   POST /ci/installations/:id/remove    removal PR
 *   GET  /ci-runs                        CI Runs list, newest first
 *   POST /ci-runs/refresh                pull-ingest result artifacts now
 * Per-route rate limits (NFR-3) only take effect where app.ts registers
 * @fastify/rate-limit, i.e. every nodeEnv except `test`.
 */
export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const logOf = (req: { log: CiLog }): CiLog => ({
    info: (obj, msg) => req.log.info(obj, msg),
    warn: (obj, msg) => req.log.warn(obj, msg),
  });

  app.post(
    '/agents/:id/ci/preview',
    {
      schema: { params: IdParams, body: CiPreviewInput, response: { 200: CiPreview } },
      config: { rateLimit: CI_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.ci.preview(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/agents/:id/export-ci',
    {
      // The workflow text travels in the body and may approach the 5 MB file cap.
      bodyLimit: CI_EXPORT_BODY_LIMIT_BYTES,
      schema: { params: IdParams, body: CiExportInput, response: { 200: CiExport } },
      config: { rateLimit: CI_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.ci.exportCi(workspaceId, req.params.id, req.body, logOf(req));
    },
  );

  app.get(
    '/agents/:id/ci/installations',
    { schema: { params: IdParams, response: { 200: CiInstallationList } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.ci.listInstallations(workspaceId, req.params.id);
    },
  );

  app.post(
    '/ci/installations/:id/remove',
    {
      schema: { params: IdParams, body: RemoveBody, response: { 200: CiRemoveResult } },
      config: { rateLimit: CI_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.ci.remove(workspaceId, req.params.id, logOf(req));
    },
  );

  app.get(
    '/ci-runs',
    { schema: { querystring: CiRunsQuery, response: { 200: CiRunList } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.ci.listRuns(workspaceId, req.query);
    },
  );

  app.post(
    '/ci-runs/refresh',
    {
      schema: { body: CiRefreshInput.nullish(), response: { 200: CiRefreshResult } },
      config: { rateLimit: CI_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.ciIngest.refresh(workspaceId, req.body?.agent_id, logOf(req));
    },
  );
}
