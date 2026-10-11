import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import type { OnboardingLog } from './ports.js';
import { GenerateResponse, OnboardingState } from './schemas.js';

/**
 * Onboarding module.
 *   GET  /repos/:id/onboarding -> stored tour + state (cloned / generating / index / stale)
 *   POST /repos/:id/onboarding -> generate (replace) the repository's tour
 * The POST never hands the request's abort signal to the service: a closed
 * socket does not cancel a generation (AC-34).
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/repos/:id/onboarding',
    { schema: { params: IdParams, response: { 200: OnboardingState } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.onboarding.getState(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/onboarding',
    { schema: { params: IdParams, response: { 200: GenerateResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const log: OnboardingLog = {
        info: (obj, msg) => req.log.info(obj, msg),
        warn: (obj, msg) => req.log.warn(obj, msg),
      };
      const tour = await container.onboarding.generate(workspaceId, req.params.id, log);
      return { tour };
    },
  );
}
