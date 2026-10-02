import type { FastifyRequest } from 'fastify';
import type { Container } from '../../platform/container.js';

export interface RequestContext {
  workspaceId: string;
  userId: string;
}

/**
 * Resolve the tenancy context for a request via the AuthProvider. In MVP
 * (LocalNoAuthProvider) this always returns the default workspace + system user.
 * Every module uses this so workspace scoping is never forgotten.
 */
export async function getContext(
  container: Container,
  req: FastifyRequest,
): Promise<RequestContext> {
  const { auth } = container;
  const [{ id: userId }, { id: workspaceId }] = await Promise.all([
    auth.currentUser(req),
    auth.currentWorkspace(req),
  ]);
  return { workspaceId, userId };
}
