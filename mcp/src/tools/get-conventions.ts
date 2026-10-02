import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { decodeCursor, MAX_RESPONSE_CHARS, paginate } from '../lib/paginate.js';
import { ok } from '../lib/result.js';
import { sanitizeText } from '../lib/sanitize.js';
import type { ConventionRecord } from '../gateway/ports.js';
import { guarded, type ToolDeps } from './deps.js';
import { ConventionListShape, RepoArg, CursorArg, LimitArg, type ConventionList } from './schemas.js';

const DEFAULT_LIMIT = 25;
const EMPTY_NOTE = 'No conventions extracted yet; run extraction from the DevDigest UI (it is not available via MCP).';

export function registerGetConventions(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'get_conventions',
    {
      title: 'Get repo conventions',
      description: 'Get the coding conventions DevDigest extracted from a repository, paginated.',
      inputSchema: {
        repo: RepoArg,
        accepted_only: z.boolean().optional().describe('Only conventions accepted in DevDigest, e.g. true (default false)'),
        include_snippets: z.boolean().optional().describe('Include the evidence code snippet, e.g. true (default false)'),
        limit: LimitArg(DEFAULT_LIMIT).optional(),
        cursor: CursorArg.optional(),
      },
      outputSchema: ConventionListShape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    guarded(deps, async ({ repo, accepted_only, include_snippets, limit, cursor }) => {
      const repoRec = await deps.resolver.resolveRepo(repo);
      const { headSha, items } = await deps.gateway.conventions(repoRec.id);
      const accepted = items.filter((c) => c.accepted);
      const selected = accepted_only ? accepted : items;
      const scopeKey = `${repoRec.id}|${headSha}|${accepted_only ? 'a' : '-'}`;
      const offset = decodeCursor(cursor, scopeKey);

      const toRow = (c: ConventionRecord): ConventionList['conventions'][number] => {
        const row: ConventionList['conventions'][number] = {
          id: c.id,
          rule: sanitizeText(c.rule, 300),
          file: sanitizeText(c.evidencePath, 300),
          line: c.evidenceLine,
          confidence: c.confidence,
          accepted: c.accepted,
        };
        if (include_snippets && c.evidenceSnippet) row.snippet = sanitizeText(c.evidenceSnippet, 400);
        return row;
      };
      const assemble = (page: ConventionRecord[], next: string | null): ConventionList => ({
        repo: repoRec.fullName,
        head_sha: headSha,
        total: selected.length,
        accepted_count: accepted.length,
        conventions: page.map(toRow),
        next_cursor: next,
        note: items.length === 0 ? EMPTY_NOTE : null,
      });
      const page = paginate({
        all: selected,
        offset,
        limit: limit ?? DEFAULT_LIMIT,
        scopeKey,
        maxChars: MAX_RESPONSE_CHARS,
        measure: (p) => JSON.stringify(assemble(p, 'x'.repeat(60))).length,
      });
      return ok(assemble(page.items, page.nextCursor));
    }),
  );
}
