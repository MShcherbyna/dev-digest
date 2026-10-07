import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastRadiusResponse, PriorPrsResponse } from './schemas.js';

/**
 * Blast module.
 *   GET /pulls/:id/blast → changed symbols, their callers (file:line) and the
 *   endpoints/crons in those caller files, from the precomputed repo-intel index.
 *   No LLM, no writes; GitHub is only consulted when the PR has no persisted files.
 *   GET /pulls/:id/blast/history → prior merged PRs that touched the changed files
 *   (GitHub GraphQL, bounded, cached; never errors on a GitHub failure; no LLM, no writes).
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadiusResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.blast.get(workspaceId, req.params.id);
    },
  );

  app.get(
    '/pulls/:id/blast/history',
    { schema: { params: IdParams, response: { 200: PriorPrsResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.blast.history(workspaceId, req.params.id);
    },
  );
}
