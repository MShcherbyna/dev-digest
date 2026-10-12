import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import type { BriefLog } from './ports.js';
import { BriefState, GenerateBriefResponse } from './schemas.js';

/**
 * PR Brief module.
 *   GET  /pulls/:id/brief           -> stored brief + state (stale / generating)
 *   POST /pulls/:id/brief/generate  -> generate (replace) the PR's brief
 * The POST never hands the request's abort signal to the service: a closed
 * socket does not cancel a generation (AC-35). Its per-route rate limit
 * (10/min) only takes effect where app.ts registers @fastify/rate-limit, i.e.
 * every nodeEnv except `test`.
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: BriefState } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.brief.getState(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief/generate',
    {
      schema: { params: IdParams, response: { 200: GenerateBriefResponse } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const log: BriefLog = {
        info: (obj, msg) => req.log.info(obj, msg),
        warn: (obj, msg) => req.log.warn(obj, msg),
      };
      const brief = await container.brief.generate(workspaceId, req.params.id, log);
      return { brief };
    },
  );
}
