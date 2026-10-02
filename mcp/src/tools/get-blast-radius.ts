import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ok } from '../lib/result.js';
import { guarded, type ToolDeps } from './deps.js';
import { BlastRadiusStubShape, PrArg, RepoArg } from './schemas.js';

export function registerGetBlastRadius(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'devdigest_get_blast_radius',
    {
      title: 'Blast radius (stub)',
      description:
        '(Stub — returns placeholder.) Do not trust the output. State the limitation but do not block the report because blast radius is missing.',
      inputSchema: { repo: RepoArg, pr: PrArg },
      outputSchema: BlastRadiusStubShape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    // Arguments are validated by the SDK, deliberately not resolved: no API call.
    guarded(deps, async () =>
      ok({
        status: 'not_implemented' as const,
        message:
          'Blast radius is not implemented yet. Proceed with the review without it and mention the limitation in your report.',
      })),
  );
}
