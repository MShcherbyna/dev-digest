import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { toDto } from './helpers.js';
import type { IntentLog } from './ports.js';
import { DeriveIntentBody, DeriveIntentResponse, IntentResponse } from './schemas.js';

/**
 * Intent module.
 *   GET  /pulls/:id/intent         → stored intent or null (pure read: no LLM, no GitHub, no writes)
 *   POST /pulls/:id/intent/derive  → { mode: 'ifAbsent' | 'regenerate' } (rate-limited: costs LLM money)
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: IntentResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const intent = await container.intent.get(workspaceId, req.params.id);
      return { intent: intent ? toDto(intent) : null };
    },
  );

  app.post(
    '/pulls/:id/intent/derive',
    {
      schema: { params: IdParams, body: DeriveIntentBody, response: { 200: DeriveIntentResponse } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const log: IntentLog = {
        info: (msg, data) => req.log.info(data ?? {}, msg),
        tool: (msg, data) => req.log.debug(data ?? {}, msg),
        warn: (msg, data) => req.log.warn(data ?? {}, msg),
      };
      const { intent, outcome } = await container.intent.derive(
        workspaceId,
        req.params.id,
        req.body.mode,
        log,
      );
      return { intent: toDto(intent), outcome };
    },
  );
}
