import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { decodeCursor, MAX_RESPONSE_CHARS, paginate } from '../lib/paginate.js';
import { ok } from '../lib/result.js';
import { sanitizeText } from '../lib/sanitize.js';
import type { BlastGroupRecord, BlastRecord } from '../gateway/ports.js';
import { guarded, type ToolDeps } from './deps.js';
import { webUrl } from './review-result.js';
import { BlastRadiusShape, CursorArg, LimitArg, PrArg, RepoArg, type BlastRadiusResult } from './schemas.js';

const DEFAULT_LIMIT = 10;
/** The changed-symbol list is not paginated; it is cut here and `changed_symbols_total` says how many exist. */
const MAX_CHANGED_SYMBOLS = 100;
const NAME_MAX = 120;
const PATH_MAX = 300;

const noteFor = (b: BlastRecord): string | null => {
  if (!b.degraded) return null;
  const reason = b.reason ? sanitizeText(b.reason, 60) : 'unknown';
  return reason === 'no_changed_files'
    ? 'No changed files are recorded for this PR yet; open the PR in DevDigest, then retry.'
    : `Repo index incomplete (${reason}); the map may be missing callers, endpoints or crons. Say so in your report.`;
};

export function registerGetBlastRadius(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'devdigest_get_blast_radius',
    {
      title: 'Blast radius',
      description:
        'Call this when reviewing a PR to see what else the change can break: its precomputed blast radius (changed symbols, callers as file:line, dependent endpoints and crons). Read-only; no analysis or LLM call.',
      inputSchema: {
        repo: RepoArg,
        pr: PrArg,
        limit: LimitArg(DEFAULT_LIMIT).optional(),
        cursor: CursorArg.optional(),
      },
      outputSchema: BlastRadiusShape,
      // openWorldHint: PR resolution (GET /repos/:id/pulls) may sync from GitHub, like devdigest_get_findings.
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    guarded(deps, async ({ repo, pr, limit, cursor }) => {
      const resolved = await deps.resolver.resolvePr(repo, pr);
      return deps.resolver.guardPr(repo, pr, async () => {
        // Pass-through of the route's map: no recomputation, no model.
        const blast = await deps.gateway.getBlastRadius(resolved.prId);
        const scopeKey = `${resolved.prId}|${blast.refSha ?? ''}|${blast.downstream.length}`;
        const offset = decodeCursor(cursor, scopeKey);

        const toGroup = (g: BlastGroupRecord): BlastRadiusResult['downstream'][number] => ({
          symbol: sanitizeText(g.symbol, NAME_MAX),
          callers: g.callers.map((c) => ({
            name: sanitizeText(c.name, NAME_MAX),
            file: sanitizeText(c.file, PATH_MAX),
            line: c.line,
          })),
          endpoints_affected: g.endpoints.map((e) => sanitizeText(e, PATH_MAX)),
          crons_affected: g.crons.map((c) => sanitizeText(c, PATH_MAX)),
        });
        const assemble = (page: BlastGroupRecord[], next: string | null): BlastRadiusResult => ({
          repo: resolved.repo.fullName,
          pr,
          summary: sanitizeText(blast.summary, PATH_MAX),
          degraded: blast.degraded,
          reason: blast.reason ? sanitizeText(blast.reason, 60) : null,
          ref_sha: blast.refSha ? sanitizeText(blast.refSha, 64) : null,
          changed_symbols_total: blast.changedSymbols.length,
          changed_symbols: blast.changedSymbols.slice(0, MAX_CHANGED_SYMBOLS).map((s) => ({
            name: sanitizeText(s.name, NAME_MAX),
            file: sanitizeText(s.file, PATH_MAX),
            kind: sanitizeText(s.kind, 40),
          })),
          downstream_total: blast.downstream.length,
          downstream: page.map(toGroup),
          next_cursor: next,
          web_url: webUrl(deps.config.webUrl, resolved.repo.id, pr),
          note: noteFor(blast),
        });
        const page = paginate({
          all: blast.downstream,
          offset,
          limit: limit ?? DEFAULT_LIMIT,
          scopeKey,
          maxChars: MAX_RESPONSE_CHARS,
          measure: (p) => JSON.stringify(assemble(p, 'x'.repeat(60))).length,
        });
        return ok(assemble(page.items, page.nextCursor));
      });
    }),
  );
}
