import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import {
  ContextFileContent,
  ContextFileQuery,
  ContextListing,
  ContextPaths,
  ContextRepoQuery,
} from './schemas.js';

/**
 * Project Context module.
 *   GET /repos/:id/context              → discovered markdown docs in the repo clone
 *   GET /repos/:id/context/file?path=   → one discoverable doc's text
 *   GET|PUT /agents/:id/context?repo_id= → ordered attached paths for that repo (no version bump)
 *   GET|PUT /skills/:id/context?repo_id= → same, for skills
 * `repo_id` is required: missing/malformed → 422; unknown or foreign agent,
 * skill or repo → 404; path-rule and duplicate violations → 400 (service);
 * a malformed body is 422.
 */
export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: ContextListing } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContext.discover(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/file',
    {
      schema: {
        params: IdParams,
        querystring: ContextFileQuery,
        response: { 200: ContextFileContent },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContext.readFile(workspaceId, req.params.id, req.query.path);
    },
  );

  app.get(
    '/agents/:id/context',
    {
      schema: { params: IdParams, querystring: ContextRepoQuery, response: { 200: ContextPaths } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContext.getAgentContext(workspaceId, req.params.id, req.query.repo_id);
    },
  );

  app.put(
    '/agents/:id/context',
    {
      schema: {
        params: IdParams,
        querystring: ContextRepoQuery,
        body: ContextPaths,
        response: { 200: ContextPaths },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContext.setAgentContext(
        workspaceId,
        req.params.id,
        req.query.repo_id,
        req.body,
      );
    },
  );

  app.get(
    '/skills/:id/context',
    {
      schema: { params: IdParams, querystring: ContextRepoQuery, response: { 200: ContextPaths } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContext.getSkillContext(workspaceId, req.params.id, req.query.repo_id);
    },
  );

  app.put(
    '/skills/:id/context',
    {
      schema: {
        params: IdParams,
        querystring: ContextRepoQuery,
        body: ContextPaths,
        response: { 200: ContextPaths },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContext.setSkillContext(
        workspaceId,
        req.params.id,
        req.query.repo_id,
        req.body,
      );
    },
  );
}
