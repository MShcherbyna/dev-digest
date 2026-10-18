import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { parse } from 'yaml';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockCiGitHub } from '../src/adapters/mocks.js';
import { CiGitHubError } from '../src/modules/ci/ports.js';
import { GHOST } from './helpers/eval.js';
import {
  buildCiApp,
  installDirect,
  installedFiles,
  newAgent,
  seedCiRepo,
  workflowWith,
  WORKFLOW_PATH,
} from './helpers/ci.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci-remove] Docker not available — skipping integration tests.');
}

d('POST /ci/installations/:id/remove (Testcontainers pg)', () => {
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

  const remove = (id: string) => app!.inject({ method: 'POST', url: `/ci/installations/${id}/remove` });
  const installationsOf = async (agentId: string) =>
    (await app!.inject({ method: 'GET', url: `/agents/${agentId}/ci/installations` })).json() as any[];

  it('AC-34/E-18: removing the last agent deletes every DevDigest CI file on devdigest/ci, in one commit + PR', async () => {
    const files = { ...installedFiles('solo', ['style']), [WORKFLOW_PATH]: workflowWith('solo'), 'src/app.ts': 'code' };
    const gh = new MockCiGitHub({ files });
    app = await buildCiApp(pg.handle.db, gh);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Solo');
    const id = await installDirect(pg.handle.db, { agentId: agent.id, repo: repo.fullName, slug: 'solo', skillSlugs: ['style'] });

    const res = await remove(id);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pr_url).toBe('https://github.com/acme/repo/pull/100');
    expect(body.installation).toMatchObject({ id, status: 'removing', removal_pr_url: body.pr_url });

    expect(gh.filesOf('devdigest/ci')).toEqual({ 'src/app.ts': 'code' });
    expect(gh.filesOf('main')).toEqual(files); // default branch is never written
    expect(gh.commits).toHaveLength(1);
    expect(gh.prs.map((p) => p.title)).toEqual(['Remove DevDigest CI review']);
    expect(gh.calls.length).toBeLessThanOrEqual(8); // NFR-1
  });

  it('AC-34: with agents A and B installed, removing A leaves B’s files and job byte-identical', async () => {
    const wf = workflowWith('alpha', 'beta');
    const files = {
      ...installedFiles('alpha', ['shared', 'alpha-only']),
      ...installedFiles('beta', ['shared', 'beta-only']),
      [WORKFLOW_PATH]: wf,
    };
    const gh = new MockCiGitHub({ files });
    app = await buildCiApp(pg.handle.db, gh);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const a = await newAgent(app, 'Alpha');
    const b = await newAgent(app, 'Beta');
    const aId = await installDirect(pg.handle.db, { agentId: a.id, repo: repo.fullName, slug: 'alpha', skillSlugs: ['shared', 'alpha-only'] });
    await installDirect(pg.handle.db, { agentId: b.id, repo: repo.fullName, slug: 'beta', skillSlugs: ['shared', 'beta-only'] });

    expect((await remove(aId)).statusCode).toBe(200);
    const after = gh.filesOf('devdigest/ci');
    expect(Object.keys(after)).not.toContain('.devdigest/agents/alpha.yaml');
    expect(Object.keys(after)).not.toContain('.devdigest/skills/alpha-only.md');
    for (const keep of [
      '.devdigest/agents/beta.yaml',
      '.devdigest/skills/shared.md',
      '.devdigest/skills/beta-only.md',
      '.devdigest/memory.jsonl',
      '.devdigest/runner/index.js',
    ]) {
      expect(after[keep], keep).toBe(files[keep as keyof typeof files]);
    }
    expect(Object.keys((parse(after[WORKFLOW_PATH]!) as { jobs: object }).jobs)).toEqual(['beta']);
    const betaBlock = wf.slice(wf.indexOf('  beta:')).trimEnd();
    expect(after[WORKFLOW_PATH]).toContain(betaBlock);
    // B's installation is untouched
    expect((await installationsOf(b.id))[0]).toMatchObject({ removal_pr_url: null });
  });

  it('D-8/AC-35: nothing committed in the repo (zip install) -> an empty commit still goes through a removal PR', async () => {
    const gh = new MockCiGitHub();
    app = await buildCiApp(pg.handle.db, gh);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Zip Only');
    const id = await installDirect(pg.handle.db, { agentId: agent.id, repo: repo.fullName, slug: 'zip-only', mode: 'manual' });

    const res = await remove(id);
    expect(res.statusCode).toBe(200);
    expect(gh.commits).toHaveLength(1);
    expect(gh.commits[0]).toMatchObject({ upserts: [], deletes: [] });
    expect(res.json().installation.status).toBe('removing');
    expect(gh.prs).toHaveLength(1);
  });

  it('E-17: removing while the export PR is open reuses the branch and the open PR', async () => {
    const gh = new MockCiGitHub();
    app = await buildCiApp(pg.handle.db, gh);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Pending Export');
    const exported = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: repo.fullName, mode: 'pr', triggers: ['opened'], post_as: 'none' },
    });
    expect(exported.statusCode).toBe(200);
    const installationId = exported.json().installation.id;

    const res = await remove(installationId);
    expect(res.statusCode).toBe(200);
    expect(gh.prs).toHaveLength(1);
    expect(res.json().pr_url).toBe(exported.json().pr_url);
    expect(gh.commits[1]!.createBranch).toBe(false);
    expect(gh.filesOf('devdigest/ci')).toEqual({}); // the agent's files left the PR
  });

  describe('AC-35: the removal PR outcome (seen on refresh)', () => {
    async function setup(name: string) {
      const gh = new MockCiGitHub({ files: { ...installedFiles(name), [WORKFLOW_PATH]: workflowWith(name) } });
      app = await buildCiApp(pg.handle.db, gh);
      const repo = await seedCiRepo(pg.handle.db, workspaceId);
      const agent = await newAgent(app, name);
      const id = await installDirect(pg.handle.db, { agentId: agent.id, repo: repo.fullName, slug: name });
      // an ingested run that must survive the installation
      await pg.handle.db.insert(t.ciRuns).values({
        workspaceId,
        ciInstallationId: id,
        agentId: agent.id,
        agentSlug: name,
        agentName: name,
        repo: repo.fullName,
        githubRunId: 9000 + Math.floor(Math.random() * 1000),
        status: 'succeeded',
        source: 'ci',
        ranAt: new Date(),
      });
      await remove(id);
      return { gh, agent, id, repo };
    }
    const runsOf = (agentId: string) => pg.handle.db.select().from(t.ciRuns).where(eq(t.ciRuns.agentId, agentId));
    const refresh = () => app!.inject({ method: 'POST', url: '/ci-runs/refresh' });

    it('merged -> the installation is deleted, CI runs are kept', async () => {
      const { gh, agent } = await setup('merged-agent');
      gh.prs[0]!.state = 'merged';
      expect((await refresh()).statusCode).toBe(200);
      expect(await installationsOf(agent.id)).toHaveLength(0);
      const runs = await runsOf(agent.id);
      expect(runs).toHaveLength(1);
      expect(runs[0]!.ciInstallationId).toBeNull();
      expect(runs[0]!.repo).toBeTruthy();
    });

    it('closed unmerged -> back to the status without removing', async () => {
      const { gh, agent } = await setup('closed-agent');
      gh.prs[0]!.state = 'closed';
      await refresh();
      const [inst] = await installationsOf(agent.id);
      expect(inst).toMatchObject({ removal_pr_url: null, status: 'pending' });
      expect(await runsOf(agent.id)).toHaveLength(1);
    });

    it('still open -> stays removing', async () => {
      const { agent } = await setup('open-agent');
      await refresh();
      expect((await installationsOf(agent.id))[0].status).toBe('removing');
    });
  });

  describe('AC-36: failures leave the installation unchanged', () => {
    async function installed(name: string, gh: MockCiGitHub | null) {
      app = await buildCiApp(pg.handle.db, gh);
      const repo = await seedCiRepo(pg.handle.db, workspaceId);
      const agent = await newAgent(app, name);
      const id = await installDirect(pg.handle.db, { agentId: agent.id, repo: repo.fullName, slug: name });
      return { agent, id };
    }

    it('no token -> 422 github_token_missing', async () => {
      const { agent, id } = await installed('rm-no-token', null);
      const res = await remove(id);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('github_token_missing');
      expect((await installationsOf(agent.id))[0].removal_pr_url).toBeNull();
    });

    it('permission -> 403 github_permission naming it', async () => {
      const gh = new MockCiGitHub({ files: installedFiles('rm-perm') });
      gh.failOn.set('commit', new CiGitHubError('permission', 'denied', 'workflows'));
      const { agent, id } = await installed('rm-perm', gh);
      const res = await remove(id);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.details).toEqual({ permission: 'workflows' });
      expect((await installationsOf(agent.id))[0].removal_pr_url).toBeNull();
    });

    it('other GitHub failure -> 502 github_error', async () => {
      const gh = new MockCiGitHub();
      gh.failOn.set('openPr', new CiGitHubError('network', 'down'));
      const { agent, id } = await installed('rm-net', gh);
      const res = await remove(id);
      expect(res.statusCode).toBe(502);
      expect(res.json().error.code).toBe('github_error');
      expect((await installationsOf(agent.id))[0].status).not.toBe('removing');
    });

    it('unknown installation -> 404', async () => {
      app = await buildCiApp(pg.handle.db, new MockCiGitHub());
      expect((await remove(GHOST)).statusCode).toBe(404);
    });
  });
});
