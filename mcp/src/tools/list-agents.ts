import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ok } from '../lib/result.js';
import { slugify } from '../lib/resolve.js';
import { sanitizeText } from '../lib/sanitize.js';
import { guarded, type ToolDeps } from './deps.js';
import { AgentListShape, type AgentList } from './schemas.js';

export function registerListAgents(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'devdigest_list_agents',
    {
      title: 'List review agents',
      description:
        'List DevDigest reviewer agents with name, slug, model and enabled flag. Pass a name or slug as `agent` to the other tools.',
      inputSchema: {
        enabled_only: z.boolean().optional().describe('Only agents that are enabled, e.g. true (default false)'),
      },
      outputSchema: AgentListShape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    guarded(deps, async ({ enabled_only }) => {
      const agents = await deps.gateway.listAgents();
      const rows = agents
        .filter((a) => !enabled_only || a.enabled)
        .map((a) => ({
          id: a.id,
          slug: slugify(a.name),
          name: sanitizeText(a.name, 100),
          description: sanitizeText(a.description, 160),
          provider: a.provider,
          model: a.model,
          enabled: a.enabled,
        }));
      const result: AgentList = { count: rows.length, agents: rows };
      return ok(result);
    }),
  );
}
