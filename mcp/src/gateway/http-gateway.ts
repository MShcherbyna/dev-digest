import { z } from 'zod';
import type { Config } from '../config.js';
import { nullLogger, type Logger } from '../lib/logger.js';
import {
  ApiActiveRun,
  ApiAgent,
  ApiConventionList,
  ApiErrorEnvelope,
  ApiPrMeta,
  ApiRepo,
  ApiReview,
  ApiRunSummary,
  ApiStartedReview,
} from './api-schemas.js';
import { GatewayNotFoundError, GatewayResponseError, GatewayUnavailableError } from './errors.js';
import type {
  ActiveRunRecord,
  AgentRecord,
  ConventionRecord,
  DevDigestGateway,
  PullRecord,
  RepoRecord,
  ReviewRecord,
  RunRecord,
  RunStatus,
} from './ports.js';

type GatewayConfig = Pick<Config, 'apiUrl' | 'httpTimeoutMs' | 'resolveTimeoutMs'>;

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
  /** Used in 404 errors and logs. */
  what: string;
}

/** Anything the API reports that is not a terminal state is treated as still running. */
function toRunStatus(status: string | null): RunStatus {
  return status === 'done' || status === 'failed' || status === 'cancelled' ? status : 'running';
}

function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
}

export class HttpGateway implements DevDigestGateway {
  constructor(
    private readonly cfg: GatewayConfig,
    private readonly logger: Logger = nullLogger,
    private readonly fetchFn: typeof fetch = (...a) => fetch(...a),
  ) {}

  async listAgents(): Promise<AgentRecord[]> {
    return this.get('/agents', z.array(ApiAgent), { what: 'agents' });
  }

  async findRepo(fullName: string): Promise<RepoRecord | null> {
    const repos = await this.get('/repos', z.array(ApiRepo), { what: 'repos' });
    const wanted = fullName.toLowerCase();
    const hit = repos.find((r) => r.full_name.toLowerCase() === wanted);
    return hit ? { id: hit.id, owner: hit.owner, name: hit.name, fullName: hit.full_name } : null;
  }

  /**
   * Resolves PR number -> id via GET /repos/:id/pulls (same approach as the web
   * client). NOTE: that route has side effects (GitHub sync upsert + detail
   * backfill), so it can take seconds — hence the longer resolve timeout.
   */
  async findPull(repoId: string, number: number): Promise<PullRecord | null> {
    const pulls = await this.get(`/repos/${encodeURIComponent(repoId)}/pulls`, z.array(ApiPrMeta), {
      what: 'pull requests',
      timeoutMs: this.cfg.resolveTimeoutMs,
    });
    const hit = pulls.find((p) => p.number === number && p.id);
    return hit && hit.id ? { id: hit.id, number: hit.number, title: hit.title } : null;
  }

  async activeRuns(prId: string): Promise<ActiveRunRecord[]> {
    const rows = await this.get(`/pulls/${encodeURIComponent(prId)}/runs/active`, z.array(ApiActiveRun), {
      what: 'active runs',
    });
    return rows.map((r) => ({ runId: r.run_id, agentId: r.agent_id }));
  }

  async startReview(prId: string, agentId: string) {
    const res = await this.request(
      `/pulls/${encodeURIComponent(prId)}/review`,
      ApiStartedReview,
      { method: 'POST', body: { agentId }, what: 'review start' },
    );
    const first = res.runs[0];
    if (!first) {
      throw new GatewayResponseError(502, 'unexpected_response', 'The API started no run');
    }
    return { runId: first.run_id };
  }

  async listRuns(prId: string): Promise<RunRecord[]> {
    const rows = await this.get(`/pulls/${encodeURIComponent(prId)}/runs`, z.array(ApiRunSummary), { what: 'runs' });
    return rows.map((r) => ({
      runId: r.run_id,
      agentId: r.agent_id,
      agentName: r.agent_name,
      status: toRunStatus(r.status),
      error: r.error,
      score: r.score,
    }));
  }

  async reviewsForPull(prId: string): Promise<ReviewRecord[]> {
    const rows = await this.get(`/pulls/${encodeURIComponent(prId)}/reviews`, z.array(ApiReview), { what: 'reviews' });
    return rows.map((r) => ({
      id: r.id,
      runId: r.run_id,
      agentId: r.agent_id,
      agentName: r.agent_name ?? null,
      verdict: r.verdict,
      summary: r.summary,
      score: r.score,
      findings: r.findings.map((f) => ({
        id: f.id,
        severity: f.severity,
        category: f.category,
        title: f.title,
        file: f.file,
        startLine: f.start_line,
        endLine: f.end_line,
        rationale: f.rationale,
        suggestion: f.suggestion ?? null,
        confidence: f.confidence,
      })),
    }));
  }

  async conventions(repoId: string): Promise<{ headSha: string; items: ConventionRecord[] }> {
    const res = await this.get(`/repos/${encodeURIComponent(repoId)}/conventions`, ApiConventionList, {
      what: 'conventions',
    });
    return {
      headSha: res.head_sha,
      items: res.conventions.map((c) => ({
        id: c.id,
        rule: c.rule,
        evidencePath: c.evidence_path,
        evidenceSnippet: c.evidence_snippet,
        evidenceLine: c.evidence_line,
        confidence: c.confidence,
        accepted: c.accepted,
      })),
    };
  }

  private get<S extends z.ZodTypeAny>(path: string, schema: S, opts: RequestOptions): Promise<z.infer<S>> {
    return this.request(path, schema, opts);
  }

  private async request<S extends z.ZodTypeAny>(
    path: string,
    schema: S,
    opts: RequestOptions,
  ): Promise<z.infer<S>> {
    const timeoutMs = opts.timeoutMs ?? this.cfg.httpTimeoutMs;
    let res: Response;
    try {
      res = await this.fetchFn(`${this.cfg.apiUrl}${path}`, {
        method: opts.method ?? 'GET',
        headers: {
          accept: 'application/json',
          ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (isTimeoutError(err)) throw new GatewayUnavailableError('timeout', this.cfg.apiUrl, timeoutMs);
      throw new GatewayUnavailableError('api_down', this.cfg.apiUrl);
    }

    if (res.status === 404) throw new GatewayNotFoundError(opts.what);

    if (res.status >= 500) {
      if ((await this.probeReadyStatus()) === 503) {
        throw new GatewayUnavailableError('db_down', this.cfg.apiUrl);
      }
      throw await this.toResponseError(res);
    }
    if (!res.ok) throw await this.toResponseError(res);

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new GatewayResponseError(res.status, 'unexpected_response', `The API returned a non-JSON body for ${opts.what}`);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      // Log issue paths only, never the body (it may contain PR content).
      this.logger.warn('unexpected API response shape', {
        what: opts.what,
        paths: parsed.error.issues.map((i) => i.path.join('.')),
      });
      throw new GatewayResponseError(
        res.status,
        'unexpected_response',
        `The API response for ${opts.what} did not match the expected shape (MCP and API versions may differ)`,
      );
    }
    return parsed.data;
  }

  private async probeReadyStatus(): Promise<number | null> {
    try {
      const res = await this.fetchFn(`${this.cfg.apiUrl}/health/ready`, { signal: AbortSignal.timeout(2_000) });
      return res.status;
    } catch {
      return null;
    }
  }

  private async toResponseError(res: Response): Promise<GatewayResponseError> {
    try {
      const env = ApiErrorEnvelope.safeParse(await res.json());
      if (env.success) return new GatewayResponseError(res.status, env.data.error.code, env.data.error.message);
    } catch {
      // fall through
    }
    return new GatewayResponseError(res.status, 'http_error', `The API answered HTTP ${res.status}`);
  }
}
