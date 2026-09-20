import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SkillCreate, SkillImportPreviewBody, SkillUpdate } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SkillsService } from './service.js';

/**
 * Skills module (text-only prompt blocks bound to agents).
 *   GET    /skills                 → SkillSummary[]
 *   POST   /skills                 → create (201)
 *   GET    /skills/:id             → one skill
 *   PUT    /skills/:id             → partial update, bumps version
 *   DELETE /skills/:id             → delete (cascades agent links)
 *   GET    /skills/:id/versions    → body history, newest first
 *   GET    /skills/:id/usage       → usage stats (last 30d)
 *   POST   /skills/import/preview  → parse an uploaded .md; persists nothing
 */
export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.post('/skills', { schema: { body: SkillCreate } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.post(
    '/skills/import/preview',
    { schema: { body: SkillImportPreviewBody } },
    async (req) => {
      await getContext(app.container, req);
      return service.importPreview(req.body);
    },
  );

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: SkillUpdate } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.update(workspaceId, req.params.id, req.body);
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.delete(workspaceId, req.params.id);
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listVersions(workspaceId, req.params.id);
  });

  app.get('/skills/:id/usage', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const stats = await service.stats(workspaceId, req.params.id);
    return {
      used_by: stats.used_by,
      pull_pct: stats.pull_pct,
      accept_pct: stats.accept_pct === null ? null : `${stats.accept_pct}%`,
      findings_last_30_days: stats.findings_30d,
      agents: stats.agents.length > 0 ? stats.agents : null,
      by_category: stats.by_category,
    };
  });
}
