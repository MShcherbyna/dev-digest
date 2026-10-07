import { Octokit } from 'octokit';
import { z } from 'zod';
import { withTimeout } from '../../platform/resilience.js';
import {
  BLAST_HISTORY_DEADLINE_MS,
  HISTORY_COMMITS_PER_FILE,
  HISTORY_PRS_PER_COMMIT,
} from '../../modules/blast/constants.js';
import type { PriorPrHit, PriorPrQuery, PriorPrSource } from '../../modules/blast/ports.js';

export type GraphqlFn = (query: string, vars: Record<string, unknown>) => Promise<unknown>;

const PrNode = z.object({
  number: z.number().int(),
  title: z.string(),
  mergedAt: z.string().nullable(),
  bodyText: z.string().nullable().optional(),
  author: z.object({ login: z.string() }).nullable().optional(),
});
const HistoryConn = z.object({
  nodes: z
    .array(
      z
        .object({
          associatedPullRequests: z.object({ nodes: z.array(PrNode.nullable()) }),
        })
        .nullable(),
    )
    .nullable(),
});
const Payload = z.object({
  repository: z.object({ object: z.record(z.string(), z.unknown()).nullable() }).nullable(),
});

/**
 * The query text is built from numeric indices and constants only: owner, name,
 * ref and every path travel as GraphQL variables, never interpolated.
 */
export function buildHistoryQuery(pathCount: number): string {
  const idx = Array.from({ length: pathCount }, (_, i) => i);
  const decls = idx.map((i) => `$p${i}:String!`).join(',');
  const fields = idx
    .map(
      (i) =>
        `f${i}: history(path:$p${i}, first:${HISTORY_COMMITS_PER_FILE}){ nodes { associatedPullRequests(first:${HISTORY_PRS_PER_COMMIT}){ nodes { number title mergedAt bodyText author { login } } } } }`,
    )
    .join(' ');
  return `query($owner:String!,$name:String!,$ref:String!${decls ? ',' + decls : ''}){ repository(owner:$owner,name:$name){ object(expression:$ref){ ... on Commit { ${fields} } } } }`;
}

/**
 * GitHub GraphQL: one request returns, for every changed path, the merged PRs
 * associated with the commits that touched it. SDK types stay in this file.
 */
export class OctokitPriorPrSource implements PriorPrSource {
  constructor(private gql: GraphqlFn) {}

  static fromToken(token: string): OctokitPriorPrSource {
    return new OctokitPriorPrSource(new Octokit({ auth: token }).graphql as unknown as GraphqlFn);
  }

  async listForPaths(q: PriorPrQuery): Promise<PriorPrHit[]> {
    if (q.paths.length === 0) return [];
    return withTimeout(this.run(q), BLAST_HISTORY_DEADLINE_MS);
  }

  private async run(q: PriorPrQuery): Promise<PriorPrHit[]> {
    const query = buildHistoryQuery(q.paths.length);
    const call = async (ref: string) => {
      const vars: Record<string, unknown> = { owner: q.repo.owner, name: q.repo.name, ref };
      q.paths.forEach((p, i) => (vars[`p${i}`] = p));
      const parsed = Payload.safeParse(await this.gql(query, vars));
      if (!parsed.success || !parsed.data.repository) throw new Error('unexpected GitHub history payload');
      return parsed.data.repository.object;
    };

    // The base branch may be deleted/renamed: retry once on the default branch.
    let object = await call(q.ref);
    if (object === null && q.ref !== 'HEAD') object = await call('HEAD');
    if (object === null) return [];

    const hits: PriorPrHit[] = [];
    q.paths.forEach((path, i) => {
      const raw = object[`f${i}`];
      if (raw === undefined) return;
      const conn = HistoryConn.safeParse(raw);
      if (!conn.success) throw new Error('unexpected GitHub history payload');
      for (const commit of conn.data.nodes ?? []) {
        for (const pr of commit?.associatedPullRequests.nodes ?? []) {
          if (!pr) continue;
          hits.push({
            number: pr.number,
            title: pr.title,
            mergedAt: pr.mergedAt,
            author: pr.author?.login ?? 'unknown',
            body: pr.bodyText ?? '',
            path,
          });
        }
      }
    });
    return hits;
  }
}
