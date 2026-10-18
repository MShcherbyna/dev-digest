import type { CiRefreshResult, RunTrace } from '@devdigest/shared';
import { AppError, ConfigError } from '../../platform/errors.js';
import {
  INGEST_LOOKBACK_MS,
  INGEST_MAX_RUNS,
  JOB_URL_PREFIX,
  MAX_ARTIFACT_BYTES,
  NO_RESULT_ERROR,
  WORKFLOW_FILE,
  resultArtifactName,
} from './constants.js';
import { ciRunStatus, prNumberFromUrl, validateArtifact } from './domain/artifact.js';
import {
  CiGitHubError,
  type CiGitHub,
  type CiLog,
  type CiStore,
  type CiWorkflowRun,
  type InstallationRecord,
  type NewCiRun,
} from './ports.js';

export interface CiIngestDeps {
  store: CiStore;
  /** Throws `ConfigError` when no GitHub token is configured. */
  github: () => Promise<CiGitHub>;
}

interface InstallationResult {
  seen: number;
  ingested: number;
  rejected: number;
  failed: number;
  error?: string;
}

/** Errors that mean "GitHub could not be used at all" (AC-24). */
const FATAL_KINDS = new Set(['auth', 'network', 'rate_limited', 'permission']);
const FAILED_CONCLUSIONS = new Set(['failure', 'cancelled', 'timed_out']);

const clip = (s: string | null | undefined, max: number): string | null => (s ? s.slice(0, max) : null);

/**
 * Pull-only ingest of CI result artifacts (AC-21..24). `inflight` is why this
 * is a container singleton: a refresh that arrives while one is running for an
 * installation joins it instead of starting a second set of GitHub calls.
 */
export class CiIngestService {
  private inflight = new Map<string, Promise<InstallationResult>>();

  constructor(private deps: CiIngestDeps) {}

  async refresh(workspaceId: string, agentId: string | undefined, log: CiLog): Promise<CiRefreshResult> {
    const installations = await this.deps.store.listInstallations(workspaceId, agentId);
    const total: CiRefreshResult = { ingested: 0, rejected: 0, failed: 0, errors: [] };
    if (installations.length === 0) return total;

    let gh: CiGitHub;
    try {
      gh = await this.deps.github();
    } catch (err) {
      if (err instanceof ConfigError) {
        throw new AppError('github_error', 'GitHub token is not configured', 502, { code: 'github_token_missing' });
      }
      throw err;
    }

    const results = await Promise.all(installations.map((i) => this.joined(workspaceId, i, gh, log)));
    results.forEach((r, idx) => {
      total.ingested += r.ingested;
      total.rejected += r.rejected;
      total.failed += r.failed;
      if (r.error) total.errors.push({ installation_id: installations[idx]!.id, code: r.error });
    });
    if (total.errors.length === installations.length && total.errors.every((e) => FATAL_KINDS.has(e.code))) {
      throw new AppError('github_error', 'Could not refresh CI runs from GitHub', 502, { errors: total.errors });
    }
    return total;
  }

  private joined(ws: string, inst: InstallationRecord, gh: CiGitHub, log: CiLog): Promise<InstallationResult> {
    const running = this.inflight.get(inst.id);
    if (running) return running;
    const p = this.ingestInstallation(ws, inst, gh, log).finally(() => this.inflight.delete(inst.id));
    this.inflight.set(inst.id, p);
    return p;
  }

  private async ingestInstallation(
    ws: string,
    inst: InstallationRecord,
    gh: CiGitHub,
    log: CiLog,
  ): Promise<InstallationResult> {
    const started = Date.now();
    const res: InstallationResult = { seen: 0, ingested: 0, rejected: 0, failed: 0 };
    try {
      await this.ingestRuns(ws, inst, gh, log, res);
      await this.checkRemoval(inst, gh);
    } catch (err) {
      res.error = err instanceof CiGitHubError ? err.kind : 'unexpected';
    }
    log.info(
      {
        installationId: inst.id,
        seen: res.seen,
        ingested: res.ingested,
        rejected: res.rejected,
        failed: res.failed,
        error: res.error ?? null,
        durationMs: Date.now() - started,
      },
      'ci refresh',
    );
    return res;
  }

  private async ingestRuns(
    ws: string,
    inst: InstallationRecord,
    gh: CiGitHub,
    log: CiLog,
    res: InstallationResult,
  ): Promise<void> {
    const floor = Date.now() - INGEST_LOOKBACK_MS;
    const [running, terminal] = await Promise.all([
      this.deps.store.oldestRunningRunAt(inst.id),
      this.deps.store.lastTerminalRunAt(inst.id),
    ]);
    const marks = [running, terminal].filter((d): d is Date => d !== null).map((d) => d.getTime());
    const since = new Date(Math.max(marks.length > 0 ? Math.min(...marks) : floor, floor));

    const runs = await gh.listWorkflowRuns(inst.repo, WORKFLOW_FILE, since.toISOString(), INGEST_MAX_RUNS);
    let latest: { at: Date; status: NewCiRun['status'] } | null = null;

    for (const run of runs.slice(0, INGEST_MAX_RUNS)) {
      res.seen++;
      if (run.headRepoIsFork) continue;
      const existing = await this.deps.store.findRun(ws, run.id, inst.agentSlug);
      if (existing?.agentRunId) continue;

      const base = await this.baseRun(ws, inst, run);
      if (run.status !== 'completed') {
        await this.deps.store.ingestRun({ workspaceId: ws, installationId: inst.id, ciRun: { ...base, status: 'running' } });
        continue;
      }

      const artifactRef = await gh.findArtifact(inst.repo, run.id, resultArtifactName(inst.agentSlug));
      if (!artifactRef) {
        if (run.conclusion && FAILED_CONCLUSIONS.has(run.conclusion)) {
          await this.recordFailed(ws, inst, base);
          res.failed++;
          latest = newer(latest, base.ranAt, 'failed');
        }
        // success/skipped without an artifact: nothing to ingest.
        continue;
      }
      if (artifactRef.expired) continue;
      if (artifactRef.sizeBytes > MAX_ARTIFACT_BYTES) {
        log.warn({ githubRunId: run.id, installationId: inst.id, reason: 'too_large' }, 'ci artifact rejected');
        res.rejected++;
        continue;
      }
      const download = await gh.downloadArtifactJson(inst.repo, artifactRef.id, MAX_ARTIFACT_BYTES);
      if (download.kind === 'expired') continue;
      if (download.kind === 'too_large') {
        log.warn({ githubRunId: run.id, installationId: inst.id, reason: 'too_large' }, 'ci artifact rejected');
        res.rejected++;
        continue;
      }
      const check = validateArtifact(download.text, { repo: inst.repo, agentSlug: inst.agentSlug, agentId: inst.agentId });
      if (!check.ok) {
        log.warn({ githubRunId: run.id, installationId: inst.id, reason: check.reason }, 'ci artifact rejected');
        res.rejected++;
        continue;
      }

      const a = check.artifact;
      const prNumber = a.pr_number ?? run.prNumber;
      const local = prNumber === null ? undefined : await this.deps.store.prFor(ws, inst.repo, prNumber);
      const status = ciRunStatus(a.findings_count);
      const ciRun: NewCiRun = {
        ...base,
        prNumber,
        prTitle: clip(local?.title ?? run.displayTitle, 500),
        agentName: clip(a.agent, 200) ?? inst.agentName,
        status,
        findingsCount: a.findings_count,
        costUsd: a.cost_usd,
        verdict: a.verdict ?? null,
        critical: a.critical ?? null,
        warning: a.warning ?? null,
        suggestion: a.suggestion ?? null,
        blockers: a.blockers ?? null,
        durationMs: a.duration_ms ?? null,
      };
      const trace: RunTrace = {
        config: {
          agent: ciRun.agentName,
          version: String(a.manifest_version ?? inst.manifestVersion),
          provider: clip(a.provider, 200),
          model: clip(a.model, 200) ?? '',
          pr: prNumber,
          source: 'ci',
          runner_version: clip(a.runner_version, 50),
          dependencies: a.dependencies ?? null,
          commit_sha: clip(a.commit_sha ?? run.headSha, 100),
          job_url: base.jobUrl,
        },
        stats: {
          duration_ms: a.duration_ms ?? 0,
          tokens_in: 0,
          tokens_out: 0,
          cost_usd: a.cost_usd,
          findings: a.findings_count,
          grounding: '',
        },
        prompt_assembly: { system: '', user: '' },
        tool_calls: [],
        raw_output: '',
        memory_pulled: [],
        specs_read: [],
        log: [],
      };
      await this.deps.store.ingestRun({
        workspaceId: ws,
        installationId: inst.id,
        ciRun,
        agentRun: {
          prId: local?.id ?? null,
          ranAt: base.ranAt,
          provider: clip(a.provider, 200),
          model: clip(a.model, 200),
          durationMs: a.duration_ms ?? null,
          costUsd: a.cost_usd,
          status: 'done',
          error: null,
          findingsCount: a.findings_count,
          blockers: a.blockers ?? null,
        },
        trace,
      });
      res.ingested++;
      latest = newer(latest, base.ranAt, status);
    }

    if (latest && (!inst.lastRunAt || latest.at >= inst.lastRunAt)) {
      await this.deps.store.setLastRun(inst.id, latest.at, latest.status);
    }
  }

  /** AC-23: a failed/cancelled run without an artifact is recorded as `failed` with its job link. */
  private async recordFailed(ws: string, inst: InstallationRecord, base: NewCiRun): Promise<void> {
    await this.deps.store.ingestRun({
      workspaceId: ws,
      installationId: inst.id,
      ciRun: { ...base, status: 'failed' },
      agentRun: {
        prId: null,
        ranAt: base.ranAt,
        provider: null,
        model: null,
        durationMs: null,
        costUsd: null,
        status: 'failed',
        error: NO_RESULT_ERROR,
        findingsCount: null,
        blockers: null,
      },
    });
  }

  private async baseRun(ws: string, inst: InstallationRecord, run: CiWorkflowRun): Promise<NewCiRun> {
    const local = run.prNumber === null ? undefined : await this.deps.store.prFor(ws, inst.repo, run.prNumber);
    return {
      githubRunId: run.id,
      agentSlug: inst.agentSlug,
      agentId: inst.agentId,
      agentName: inst.agentName,
      repo: inst.repo,
      prNumber: run.prNumber,
      prTitle: clip(local?.title ?? run.displayTitle, 500),
      ranAt: new Date(run.createdAt),
      status: 'running',
      findingsCount: null,
      costUsd: null,
      jobUrl: run.htmlUrl.startsWith(JOB_URL_PREFIX) ? run.htmlUrl : null,
      verdict: null,
      critical: null,
      warning: null,
      suggestion: null,
      blockers: null,
      durationMs: null,
    };
  }

  /** AC-35: a merged removal PR deletes the installation (runs stay); a closed one clears `removing`. */
  private async checkRemoval(inst: InstallationRecord, gh: CiGitHub): Promise<void> {
    if (!inst.removalPrUrl) return;
    const number = prNumberFromUrl(inst.removalPrUrl);
    if (number === null) return;
    const state = await gh.prState(inst.repo, number);
    if (state === 'merged') await this.deps.store.deleteInstallation(inst.id);
    else if (state === 'closed') await this.deps.store.clearRemovalPr(inst.id);
  }
}

function newer(
  cur: { at: Date; status: NewCiRun['status'] } | null,
  at: Date,
  status: NewCiRun['status'],
): { at: Date; status: NewCiRun['status'] } {
  return cur && cur.at >= at ? cur : { at, status };
}
