import type { AgentRecord, DevDigestGateway, RepoRecord } from '../gateway/ports.js';
import { GatewayNotFoundError } from '../gateway/errors.js';
import { BusinessError } from './result.js';
import { sanitizeText } from './sanitize.js';

export interface ResolvedPr {
  repo: RepoRecord;
  prId: string;
  title: string;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const cacheKey = (repo: string, pr: number): string => `${repo.toLowerCase()}#${pr}`;

/** Repo / PR / agent resolution over the gateway, with a process-lifetime PR cache. */
export class Resolver {
  private readonly prCache = new Map<string, ResolvedPr>();

  constructor(private readonly gateway: DevDigestGateway) {}

  async resolveRepo(repo: string): Promise<RepoRecord> {
    const found = await this.gateway.findRepo(repo);
    if (!found) {
      throw new BusinessError({
        what: `Repository '${sanitizeText(repo, 140)}' is not added to DevDigest`,
        expected: 'a repo added in the DevDigest UI',
        example: 'repo: "acme/payments-api"',
        next: 'add it via Add repository in the UI, then retry',
      });
    }
    return found;
  }

  async resolvePr(repo: string, pr: number): Promise<ResolvedPr> {
    const key = cacheKey(repo, pr);
    const cached = this.prCache.get(key);
    if (cached) return cached;
    const repoRec = await this.resolveRepo(repo);
    const pull = await this.gateway.findPull(repoRec.id, pr);
    if (!pull) {
      throw new BusinessError({
        what: `PR #${pr} not found in ${repoRec.fullName}`,
        expected: 'a pull request number that DevDigest has imported',
        example: 'pr: 482',
        next: "open the repo's Pull Requests page in DevDigest to import PRs, or check the number",
      });
    }
    const resolved = { repo: repoRec, prId: pull.id, title: pull.title };
    this.prCache.set(key, resolved);
    return resolved;
  }

  /**
   * Runs a PR-scoped gateway operation; if the API says the PR (or its runs) no longer
   * exist, drops the cached resolution so the next call re-resolves, then rethrows.
   */
  async guardPr<T>(repo: string, pr: number, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof GatewayNotFoundError) this.evictPr(repo, pr);
      throw err;
    }
  }

  /** Drop a cached PR resolution (see guardPr). */
  evictPr(repo: string, pr: number): void {
    this.prCache.delete(cacheKey(repo, pr));
  }

  async resolveAgent(agent: string): Promise<AgentRecord> {
    const agents = await this.gateway.listAgents();
    return matchAgent(agents, agent);
  }
}

export function matchAgent(agents: AgentRecord[], query: string): AgentRecord {
  const q = query.trim();
  const byId = agents.find((a) => a.id === q);
  if (byId) return byId;

  const lower = q.toLowerCase();
  const byName = agents.filter((a) => a.name.toLowerCase() === lower);
  if (byName.length === 1 && byName[0]) return byName[0];
  if (byName.length > 1) throw ambiguous(q, byName);

  const slug = slugify(q);
  const bySlug = agents.filter((a) => slugify(a.name) === slug);
  if (bySlug.length === 1 && bySlug[0]) return bySlug[0];
  if (bySlug.length > 1) throw ambiguous(q, bySlug);

  throw new BusinessError({
    what: `Agent '${sanitizeText(q, 100)}' not found`,
    expected: 'an agent name or slug from list_agents',
    example: 'agent: "security-reviewer"',
    next: 'call list_agents',
  });
}

function ambiguous(q: string, candidates: AgentRecord[]): BusinessError {
  return new BusinessError({
    what: `Agent '${sanitizeText(q, 100)}' is ambiguous (matches: ${candidates.map((c) => sanitizeText(c.name, 60)).join(', ')})`,
    expected: 'a unique agent name or the agent id',
    example: `agent: "${candidates[0]?.id ?? '<agent id>'}"`,
    next: 'call list_agents and pass the id of the agent you want',
  });
}
