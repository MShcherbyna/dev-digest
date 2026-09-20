import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsService } from './service.js';
import { ConventionIdParams, ConventionPatch, CreateSkillBody } from './schemas.js';

/**
 * Conventions module.
 *   GET    /repos/:id/conventions          → candidates + head sha
 *   POST   /repos/:id/conventions/extract  → scan (replaces every candidate, accepted included)
 *   POST   /repos/:id/conventions/skill    → merge accepted conventions into a skill (201)
 *   PATCH  /conventions/:id                → accept/unaccept and/or edit the rule
 *   DELETE /conventions/:id                → reject (deleted for good)
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateSkillBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.createSkill(workspaceId, req.params.id, req.body);
      reply.status(201);
      return skill;
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: ConventionIdParams, body: ConventionPatch } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.update(workspaceId, req.params.id, req.body);
    },
  );

  app.delete('/conventions/:id', { schema: { params: ConventionIdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.reject(workspaceId, req.params.id);
    return { ok: true };
  });
}
