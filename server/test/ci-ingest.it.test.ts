import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockCiGitHub } from '../src/adapters/mocks.js';
import { CiGitHubError } from '../src/modules/ci/ports.js';
import { buildCiApp, installDirect, newAgent, seedCiRepo } from './helpers/ci.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci-ingest] Docker not available — skipping integration tests.');
}

let runSeq = 1000;
const nextRunId = () => ++runSeq;

d('CI ingest + GET /ci-runs (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let app: FastifyInstance | undefined;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  /** An agent installed (GitHub Actions) in a fresh repo. */
  async function setup(name: string, gh: MockCiGitHub | null) {
    app = await buildCiApp(pg.handle.db, gh);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, name);
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const installationId = await installDirect(pg.handle.db, { agentId: agent.id, repo: repo.fullName, slug });
    const artifactName = `devdigest-result-${slug}`;
    const artifact = (over: Record<string, unknown> = {}) =>
      JSON.stringify({
        findings_count: 2,
        critical: 1,
        warning: 1,
        suggestion: 0,
        cost_usd: 0.02,
        duration_ms: 4200,
        agent: name,
        version: '1',
        pr_number: 7,
        verdict: 'request_changes',
        blockers: 1,
        agent_slug: slug,
        agent_id: agent.id,
        manifest_version: 1,
        provider: 'openrouter',
        model: 'openai/gpt-4.1',
        runner_version: '2',
        dependencies: { reviewer_core: '0.1.0', node: 'v22.1.0' },
        commit_sha: 'deadbeef',
        repo: repo.fullName,
        ...over,
      });
    return { agent, repo, slug, installationId, artifactName, artifact };
  }

  const refresh = (agentId?: string) =>
    app!.inject({ method: 'POST', url: '/ci-runs/refresh', payload: agentId ? { agent_id: agentId } : undefined });
  const ciRunsOf = (agentId: string) => pg.handle.db.select().from(t.ciRuns).where(eq(t.ciRuns.agentId, agentId));
  const agentRunsOf = (agentId: string) => pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.agentId, agentId));

  it('AC-21/22: three runs give three fetches and three rows; ingesting twice creates no duplicates', async () => {
    const gh = new MockCiGitHub();
    const s = await setup('Triple Agent', gh);
    for (const n of [1, 2, 3]) gh.addRun({ id: nextRunId(), prNumber: n }, { name: s.artifactName, text: s.artifact({ pr_number: n }) });

    const first = await refresh(s.agent.id);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ ingested: 3, rejected: 0, failed: 0, errors: [] });
    expect(gh.count('findArtifact')).toBe(3);
    expect(gh.count('downloadArtifactJson')).toBe(3);

    const second = await refresh(s.agent.id);
    expect(second.json().ingested).toBe(0);
    expect(gh.count('downloadArtifactJson')).toBe(3); // nothing fetched again

    expect(await ciRunsOf(s.agent.id)).toHaveLength(3);
    const agentRuns = await agentRunsOf(s.agent.id);
    expect(agentRuns).toHaveLength(3);
    const traces = await pg.handle.db.select().from(t.runTraces);
    expect(traces.filter((tr) => agentRuns.some((r) => r.id === tr.runId))).toHaveLength(3);
  });

  it('AC-21: concurrent refreshes join one ingest (one set of GitHub calls)', async () => {
    const gh = new MockCiGitHub();
    const s = await setup('Concurrent Agent', gh);
    gh.addRun({ id: nextRunId() }, { name: s.artifactName, text: s.artifact() });
    let release!: () => void;
    gh.gate = new Promise<void>((r) => (release = r));

    const a = refresh(s.agent.id);
    const b = refresh(s.agent.id);
    const deadline = Date.now() + 5000;
    while (gh.count('listWorkflowRuns') === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
    await new Promise((r) => setTimeout(r, 150)); // let the second request reach the in-flight map
    release();
    const [ra, rb] = await Promise.all([a, b]);

    expect(ra.statusCode).toBe(200);
    expect(rb.statusCode).toBe(200);
    expect(gh.count('listWorkflowRuns')).toBe(1);
    expect(gh.count('downloadArtifactJson')).toBe(1);
    expect(await ciRunsOf(s.agent.id)).toHaveLength(1);
  });

  it('AC-22: writes the agent run, the CI trace and the CI run, linked to the local PR', async () => {
    const gh = new MockCiGitHub();
    const s = await setup('Detail Agent', gh);
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({ workspaceId, repoId: s.repo.id, number: 7, title: 'Local PR title', author: 'dev', branch: 'f', base: 'main', headSha: 'x' })
      .returning();
    const runId = nextRunId();
    gh.addRun({ id: runId, prNumber: 7, displayTitle: 'GitHub title' }, { name: s.artifactName, text: s.artifact() });
    await refresh(s.agent.id);

    const [ci] = await ciRunsOf(s.agent.id);
    expect(ci).toMatchObject({
      workspaceId,
      ciInstallationId: s.installationId,
      prNumber: 7,
      prTitle: 'Local PR title',
      status: 'succeeded',
      findingsCount: 2,
      critical: 1,
      warning: 1,
      suggestion: 0,
      verdict: 'request_changes',
      blockers: 1,
      durationMs: 4200,
      costUsd: 0.02,
      source: 'ci',
      agentSlug: s.slug,
      githubRunId: runId,
      githubUrl: `https://github.com/acme/repo/actions/runs/${runId}`,
    });
    const [run] = await agentRunsOf(s.agent.id);
    expect(run).toMatchObject({
      id: ci!.agentRunId,
      source: 'ci',
      status: 'done',
      prId: pr!.id,
      provider: 'openrouter',
      model: 'openai/gpt-4.1',
      durationMs: 4200,
      costUsd: 0.02,
      findingsCount: 2,
      blockers: 1,
      workspaceId,
    });
    const [trace] = await pg.handle.db.select().from(t.runTraces).where(eq(t.runTraces.runId, run!.id));
    const config = (trace!.trace as { config: Record<string, unknown> }).config;
    expect(config).toMatchObject({
      source: 'ci',
      version: '1',
      model: 'openai/gpt-4.1',
      runner_version: '2',
      dependencies: { reviewer_core: '0.1.0', node: 'v22.1.0' },
      commit_sha: 'deadbeef',
      job_url: `https://github.com/acme/repo/actions/runs/${runId}`,
    });

    const [inst] = (await app!.inject({ method: 'GET', url: `/agents/${s.agent.id}/ci/installations` })).json();
    expect(inst).toMatchObject({ status: 'active', last_run_status: 'succeeded' });
    expect(inst.last_run_at).not.toBeNull();
  });

  it('E-12: a PR missing locally keeps the number and the GitHub title, with no PR link', async () => {
    const gh = new MockCiGitHub();
    const s = await setup('Remote Pr Agent', gh);
    gh.addRun({ id: nextRunId(), prNumber: 7, displayTitle: 'Title from GitHub' }, { name: s.artifactName, text: s.artifact() });
    await refresh(s.agent.id);
    const [ci] = await ciRunsOf(s.agent.id);
    const [run] = await agentRunsOf(s.agent.id);
    expect(ci).toMatchObject({ prNumber: 7, prTitle: 'Title from GitHub' });
    expect(run!.prId).toBeNull();
  });

  it('a clean review is stored as no_findings; a tripped gate still as succeeded (E-6)', async () => {
    const gh = new MockCiGitHub();
    const s = await setup('Status Agent', gh);
    gh.addRun({ id: nextRunId() }, { name: s.artifactName, text: s.artifact({ findings_count: 0, critical: 0, warning: 0, verdict: 'approve', blockers: 0 }) });
    gh.addRun({ id: nextRunId(), conclusion: 'failure' }, { name: s.artifactName, text: s.artifact({ findings_count: 4, verdict: 'request_changes' }) });
    await refresh(s.agent.id);
    const statuses = (await ciRunsOf(s.agent.id)).map((r) => r.status).sort();
    expect(statuses).toEqual(['no_findings', 'succeeded']);
  });

  it('AC-23: schema failure, another repo, another agent, oversize and too_large store nothing', async () => {
    const gh = new MockCiGitHub();
    const s = await setup('Reject Agent', gh);
    const add = (text: string, extra: Record<string, unknown> = {}) =>
      gh.addRun({ id: nextRunId() }, { name: s.artifactName, text, ...extra });
    add('{ not json');
    add(s.artifact({ findings_count: -3 }));
    add(s.artifact({ repo: 'evil/other' }));
    add(s.artifact({ agent_slug: 'someone-else' }));
    add(s.artifact(), { sizeBytes: 6 * 1024 * 1024 });
    add(s.artifact(), { download: 'too_large' });

    const res = await refresh(s.agent.id);
    expect(res.json()).toMatchObject({ ingested: 0, rejected: 6, failed: 0 });
    expect(await ciRunsOf(s.agent.id)).toHaveLength(0);
    expect(await agentRunsOf(s.agent.id)).toHaveLength(0);
  });

  it('AC-23: failure/cancelled without an artifact is a failed CI run + failed agent run with the job link', async () => {
    const gh = new MockCiGitHub();
    const s = await setup('Crash Agent', gh);
    const failedId = nextRunId();
    const cancelledId = nextRunId();
    gh.addRun({ id: failedId, conclusion: 'failure' });
    gh.addRun({ id: cancelledId, conclusion: 'cancelled' });
    gh.addRun({ id: nextRunId(), conclusion: 'success' }); // no artifact, not a failure: nothing

    const res = await refresh(s.agent.id);
    expect(res.json()).toMatchObject({ ingested: 0, rejected: 0, failed: 2 });
    const runs = await ciRunsOf(s.agent.id);
    expect(runs.map((r) => r.status)).toEqual(['failed', 'failed']);
    expect(runs.map((r) => r.githubUrl).sort()).toEqual([
      `https://github.com/acme/repo/actions/runs/${failedId}`,
      `https://github.com/acme/repo/actions/runs/${cancelledId}`,
    ].sort());
    const agentRuns = await agentRunsOf(s.agent.id);
    expect(agentRuns).toHaveLength(2);
    for (const r of agentRuns) expect(r).toMatchObject({ source: 'ci', status: 'failed', error: 'CI run produced no result' });
    // a second refresh does not duplicate them
    await refresh(s.agent.id);
    expect(await agentRunsOf(s.agent.id)).toHaveLength(2);
  });

  it('AC-23: an in-progress run is listed as running and completed on a later refresh (one row)', async () => {
    const runId = nextRunId();
    const gh1 = new MockCiGitHub();
    const s = await setup('Running Agent', gh1);
    gh1.addRun({ id: runId, status: 'in_progress', conclusion: null });
    await refresh(s.agent.id);
    const running = await ciRunsOf(s.agent.id);
    expect(running).toHaveLength(1);
    expect(running[0]).toMatchObject({ status: 'running', agentRunId: null });
    expect(await agentRunsOf(s.agent.id)).toHaveLength(0);
    await app!.close();

    const gh2 = new MockCiGitHub();
    gh2.addRun({ id: runId }, { name: s.artifactName, text: s.artifact() });
    app = await buildCiApp(pg.handle.db, gh2);
    await refresh(s.agent.id);
    const done = await ciRunsOf(s.agent.id);
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ id: running[0]!.id, status: 'succeeded' });
    expect(done[0]!.agentRunId).not.toBeNull();
  });

  it('AC-23/E-1/E-13: expired artifacts and fork runs are skipped; a non-GitHub job URL is not stored', async () => {
    const gh = new MockCiGitHub();
    const s = await setup('Skip Agent', gh);
    gh.addRun({ id: nextRunId() }, { name: s.artifactName, text: s.artifact(), expired: true });
    gh.addRun({ id: nextRunId() }, { name: s.artifactName, text: s.artifact(), download: 'expired' });
    gh.addRun({ id: nextRunId(), headRepoIsFork: true }, { name: s.artifactName, text: s.artifact() });
    expect((await refresh(s.agent.id)).json()).toMatchObject({ ingested: 0, rejected: 0, failed: 0 });
    expect(await ciRunsOf(s.agent.id)).toHaveLength(0);

    gh.addRun({ id: nextRunId(), htmlUrl: 'javascript:alert(1)' }, { name: s.artifactName, text: s.artifact() });
    await refresh(s.agent.id);
    const [stored] = await ciRunsOf(s.agent.id);
    expect(stored!.githubUrl).toBeNull();
  });

  it('NFR-2: a refresh fetches at most 50 runs per installation', async () => {
    const gh = new MockCiGitHub();
    const s = await setup('Many Agent', gh);
    for (let i = 0; i < 60; i++) gh.addRun({ id: nextRunId() }, { name: s.artifactName, text: s.artifact() });
    const res = await refresh(s.agent.id);
    expect(res.json().ingested).toBe(50);
  });

  describe('AC-24: GitHub failures keep the stored runs', () => {
    it.each(['network', 'rate_limited', 'auth', 'permission'] as const)('%s -> 502 github_error', async (kind) => {
      const gh = new MockCiGitHub();
      const s = await setup(`Outage ${kind}`, gh);
      gh.addRun({ id: nextRunId() }, { name: s.artifactName, text: s.artifact() });
      await refresh(s.agent.id);
      const before = await ciRunsOf(s.agent.id);
      expect(before).toHaveLength(1);

      gh.failOn.set('listWorkflowRuns', new CiGitHubError(kind, 'nope', 'actions'));
      const res = await refresh(s.agent.id);
      expect(res.statusCode).toBe(502);
      expect(res.json().error.code).toBe('github_error');
      expect(await ciRunsOf(s.agent.id)).toEqual(before);
    });

    it('no GitHub token -> 502 github_error', async () => {
      const s = await setup('Tokenless Ingest', null);
      const res = await refresh(s.agent.id);
      expect(res.statusCode).toBe(502);
      expect(res.json().error.code).toBe('github_error');
    });

    it('no installations -> 200 with zero counts, even without a token', async () => {
      app = await buildCiApp(pg.handle.db, null);
      const agent = await newAgent(app, 'Lonely Agent');
      const res = await refresh(agent.id);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ingested: 0, rejected: 0, failed: 0, errors: [] });
    });

    it('accepts a request with no body at all', async () => {
      app = await buildCiApp(pg.handle.db, new MockCiGitHub());
      expect((await app.inject({ method: 'POST', url: '/ci-runs/refresh' })).statusCode).toBe(200);
    });
  });

  describe('GET /ci-runs', () => {
    it('orders newest first and filters by agent, repo, status, source, since and limit', async () => {
      app = await buildCiApp(pg.handle.db, new MockCiGitHub());
      const repoA = await seedCiRepo(pg.handle.db, workspaceId);
      const repoB = await seedCiRepo(pg.handle.db, workspaceId);
      const a1 = await newAgent(app, 'Filter One');
      const a2 = await newAgent(app, 'Filter Two');
      const day = 24 * 60 * 60 * 1000;
      const mk = (agentId: string, repo: string, status: string, ageDays: number) => ({
        workspaceId,
        agentId,
        agentSlug: `f-${agentId.slice(0, 4)}`,
        agentName: 'x',
        repo,
        status,
        source: 'ci',
        githubRunId: nextRunId(),
        ranAt: new Date(Date.now() - ageDays * day),
      });
      await pg.handle.db.insert(t.ciRuns).values([
        mk(a1.id, repoA.fullName, 'succeeded', 1),
        mk(a1.id, repoB.fullName, 'failed', 3),
        mk(a2.id, repoA.fullName, 'running', 2),
        mk(a2.id, repoA.fullName, 'no_findings', 10),
      ]);
      const list = async (qs: string) => (await app!.inject({ method: 'GET', url: `/ci-runs${qs}` })).json() as any[];

      const mine = await list(`?agent=${a1.id}`);
      expect(mine.map((r) => r.status)).toEqual(['succeeded', 'failed']); // newest first
      expect((await list(`?agent=${a2.id}`)).map((r) => r.status)).toEqual(['running', 'no_findings']);
      expect((await list(`?repo=${encodeURIComponent(repoB.fullName)}`)).map((r) => r.status)).toEqual(['failed']);
      expect((await list(`?agent=${a2.id}&status=running`)).map((r) => r.status)).toEqual(['running']);
      expect((await list(`?agent=${a2.id}&source=ci`))).toHaveLength(2);
      const since = encodeURIComponent(new Date(Date.now() - 7 * day).toISOString());
      expect((await list(`?agent=${a2.id}&since=${since}`)).map((r) => r.status)).toEqual(['running']);
      expect(await list(`?agent=${a1.id}&limit=1`)).toHaveLength(1);
      expect(mine[0]).toMatchObject({ source: 'ci', agent_slug: expect.any(String), github_run_id: expect.any(String) });
    });

    it.each([
      ['bad status', '?status=exploded'],
      ['limit 0', '?limit=0'],
      ['limit 201', '?limit=201'],
      ['agent not a uuid', '?agent=nope'],
      ['source other than ci', '?source=local'],
      ['since not a datetime', '?since=yesterday'],
    ])('422 validation_error for %s', async (_n, qs) => {
      app = await buildCiApp(pg.handle.db, new MockCiGitHub());
      const res = await app.inject({ method: 'GET', url: `/ci-runs${qs}` });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('validation_error');
    });
  });
});
