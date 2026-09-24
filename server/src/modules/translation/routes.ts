import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import type { TranslationLog } from './ports.js';
import { TranslateResponse } from './schemas.js';

/**
 * Translation module.
 *   POST /findings/:id/translate → translate one finding into the workspace's
 *   `translation_language` with the `translation` feature model (rate-limited: costs LLM money)
 */
export default async function translationRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.post(
    '/findings/:id/translate',
    {
      schema: { params: IdParams, response: { 200: TranslateResponse } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const log: TranslationLog = {
        info: (msg, data) => req.log.info(data ?? {}, msg),
        warn: (msg, data) => req.log.warn(data ?? {}, msg),
      };
      const r = await container.translation.translateFinding(workspaceId, req.params.id, log);
      return {
        language: r.language,
        model: r.model,
        finding_id: r.item.findingId,
        title: r.item.title,
        rationale: r.item.rationale,
        suggestion: r.item.suggestion,
      };
    },
  );
}
