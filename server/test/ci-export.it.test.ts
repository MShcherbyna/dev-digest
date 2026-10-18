import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockCiGitHub } from '../src/adapters/mocks.js';
import { CiGitHubError } from '../src/modules/ci/ports.js';
import { GHOST } from './helpers/eval.js';
import {
  addMemory,
  buildCiApp,
  exportBody,
  installDirect,
  linkSkill,
  newAgent,
  seedCiRepo,
  WORKFLOW_PATH,
} from './helpers/ci.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci-export] Docker not available — skipping integration tests.');
}

d('POST /agents/:id/export-ci (Testcontainers pg)', () => {
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

  const exportCi = (agentId: string, body: unknown) =>
    app!.inject({ method: 'POST', url: `/agents/${agentId}/export-ci`, payload: body as object });
  const installations = async (agentId: string) =>
    (await app!.inject({ method: 'GET', url: `/agents/${agentId}/ci/installations` })).json() as any[];

  it('AC-14: commits everything once on devdigest/ci, never on main, opens the PR and records the installation', async () => {
    const gh = new MockCiGitHub();
    app = await buildCiApp(pg.handle.db, gh);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Export Agent');
    const skillBody = 'skill text';
    await linkSkill(pg.handle.db, workspaceId, agent.id, 'Style', skillBody, 0);
    await addMemory(pg.handle.db, workspaceId, repo.id, 'repo', 'remember this');

    const res = await exportCi(agent.id, exportBody(repo.fullName));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pr_url).toBe('https://github.com/acme/repo/pull/100');
    expect(body.installation).toMatchObject({
      repo: repo.fullName,
      agent_slug: 'export-agent',
      mode: 'pr',
      status: 'pending',
      manifest_version: 1,
      post_as: 'github_review',
      triggers: ['opened', 'synchronize'],
      pr_url: body.pr_url,
      removal_pr_url: null,
    });
    expect(body.files.map((f: { path: string }) => f.path)).toEqual([
      '.devdigest/agents/export-agent.yaml',
      '.devdigest/skills/style.md',
      '.devdigest/memory.jsonl',
      '.devdigest/runner/index.js',
      WORKFLOW_PATH,
    ]);

    expect(gh.filesOf('main')).toEqual({}); // default branch untouched
    expect(gh.commits).toHaveLength(1);
    expect(gh.commits[0]).toMatchObject({ branch: 'devdigest/ci', createBranch: true, deletes: [], message: 'Add DevDigest CI review' });
    expect(Object.keys(gh.filesOf('devdigest/ci')).sort()).toEqual(body.files.map((f: { path: string }) => f.path).sort());
    expect(gh.filesOf('devdigest/ci')['.devdigest/skills/style.md']).toBe(skillBody);
    expect(gh.prs.map((p) => p.title)).toEqual(['Add DevDigest CI review']);
    expect(gh.prs[0]).toMatchObject({ head: 'devdigest/ci', base: 'main' });

    const [row] = await pg.handle.db.select().from(t.ciInstallations).where(eq(t.ciInstallations.agentId, agent.id));
    expect(row!.skillSlugs).toEqual(['style']);
    expect(await installations(agent.id)).toHaveLength(1);
  });

  it('NFR-1: install makes at most 7 GitHub calls', async () => {
    const gh = new MockCiGitHub();
    app = await buildCiApp(pg.handle.db, gh);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Budget Agent');
    await exportCi(agent.id, exportBody(repo.fullName));
    expect(gh.calls.length).toBeLessThanOrEqual(7);
    // a second export onto the existing branch with an open PR
    gh.calls.length = 0;
    await exportCi(agent.id, exportBody(repo.fullName));
    expect(gh.calls.length).toBeLessThanOrEqual(7);
  });

  it('E-4: devdigest/ci exists without an open PR -> commit on top, new PR', async () => {
    const gh = new MockCiGitHub();
    app = await buildCiApp(pg.handle.db, gh);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Existing Branch Agent');
    // first export creates the branch and a PR; close that PR to simulate "branch, no open PR"
    await exportCi(agent.id, exportBody(repo.fullName));
    gh.prs[0]!.state = 'closed';

    const res = await exportCi(agent.id, exportBody(repo.fullName));
    expect(res.statusCode).toBe(200);
    expect(gh.commits).toHaveLength(2);
    expect(gh.commits[1]!.createBranch).toBe(false);
    expect(gh.prs).toHaveLength(2);
    expect(gh.prs[1]!.title).toBe('Update DevDigest CI review'); // installation already exists (AC-28)
  });

  it('AC-28: an update reuses the open PR from devdigest/ci', async () => {
    const gh = new MockCiGitHub();
    app = await buildCiApp(pg.handle.db, gh);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Update Agent');
    const first = (await exportCi(agent.id, exportBody(repo.fullName))).json();
    const second = (await exportCi(agent.id, exportBody(repo.fullName, { post_as: 'none' }))).json();
    expect(second.pr_url).toBe(first.pr_url);
    expect(gh.prs).toHaveLength(1);
    expect(gh.commits).toHaveLength(2);
    expect(second.installation.post_as).toBe('none');
    expect(await installations(agent.id)).toHaveLength(1); // upsert, not a second row
  });

  it('uses the edited workflow text sent by the client', async () => {
    const gh = new MockCiGitHub();
    app = await buildCiApp(pg.handle.db, gh);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Edited Agent');
    const workflow = 'name: Edited by hand\non:\n  pull_request:\n    types: [opened]\njobs:\n  edited-agent:\n    runs-on: ubuntu-latest\n    steps: []\n';
    const res = await exportCi(agent.id, exportBody(repo.fullName, { workflow }));
    expect(res.statusCode).toBe(200);
    expect(gh.filesOf('devdigest/ci')[WORKFLOW_PATH]).toBe(workflow);
  });

  it('AC-27: after the agent changes, the installation reports outdated', async () => {
    app = await buildCiApp(pg.handle.db, new MockCiGitHub());
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Outdated Agent');
    await exportCi(agent.id, exportBody(repo.fullName));
    expect((await installations(agent.id))[0].status).toBe('pending');
    const put = await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { ci_fail_on: 'any' } });
    expect(put.statusCode).toBe(200);
    expect((await installations(agent.id))[0].status).toBe('outdated');
  });

  it('AC-17: manual mode makes no GitHub call and records a manual, pending installation', async () => {
    const gh = new MockCiGitHub();
    app = await buildCiApp(pg.handle.db, gh);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Zip Agent');
    const res = await exportCi(agent.id, exportBody(repo.fullName, { mode: 'manual' }));
    expect(res.statusCode).toBe(200);
    expect(gh.calls).toHaveLength(0);
    expect(res.json().pr_url).toBeNull();
    expect(res.json().installation).toMatchObject({ mode: 'manual', status: 'pending', pr_url: null, removal_pr_url: null });
  });

  it('AC-31: another agent installed in the repo blocks both PR and zip (409 multi_agent_unsupported)', async () => {
    const gh = new MockCiGitHub();
    app = await buildCiApp(pg.handle.db, gh);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const a = await newAgent(app, 'Gate A');
    const b = await newAgent(app, 'Gate B');
    await installDirect(pg.handle.db, { agentId: a.id, repo: repo.fullName, slug: 'gate-a' });
    for (const mode of ['pr', 'manual']) {
      const res = await exportCi(b.id, exportBody(repo.fullName, { mode }));
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('multi_agent_unsupported');
    }
    expect(gh.calls).toHaveLength(0);
    expect(await installations(b.id)).toHaveLength(0);
  });

  it('AC-32: the same slug on another agent is 409 agent_slug_conflict', async () => {
    app = await buildCiApp(pg.handle.db, new MockCiGitHub());
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const a = await newAgent(app, 'Same Name');
    const b = await newAgent(app, 'Same Name');
    await installDirect(pg.handle.db, { agentId: a.id, repo: repo.fullName, slug: 'same-name' });
    const res = await exportCi(b.id, exportBody(repo.fullName));
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('agent_slug_conflict');
  });

  it('AC-9: an unparsable workflow is 422 workflow_invalid with a line, nothing committed', async () => {
    const gh = new MockCiGitHub();
    app = await buildCiApp(pg.handle.db, gh);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Broken Workflow Agent');
    const res = await exportCi(agent.id, exportBody(repo.fullName, { workflow: 'name: x\njobs:\n  a: [unclosed\n' }));
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('workflow_invalid');
    expect(typeof res.json().error.details.line).toBe('number');
    expect(gh.commits).toHaveLength(0);
    expect(await installations(agent.id)).toHaveLength(0);
  });

  it('E-15: a file above 5 MB is 422 file_too_large (the 6 MiB route limit lets it reach the service)', async () => {
    const gh = new MockCiGitHub();
    app = await buildCiApp(pg.handle.db, gh);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Huge Agent');
    const workflow = `name: Huge\non:\n  pull_request:\n    types: [opened]\njobs: {}\n# ${'x'.repeat(5 * 1024 * 1024 + 10)}\n`;
    const res = await exportCi(agent.id, exportBody(repo.fullName, { workflow }));
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('file_too_large');
    expect(gh.commits).toHaveLength(0);
  });

  it('NFR-4: a secret in the workflow or in memory is 422 secret_in_export, with the path and never the value', async () => {
    const gh = new MockCiGitHub();
    app = await buildCiApp(pg.handle.db, gh);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Leaky Agent');
    const token = `ghp_${'a'.repeat(36)}`;
    const workflow = `name: x\non:\n  pull_request:\n    types: [opened]\njobs: {}\n# ${token}\n`;
    const res = await exportCi(agent.id, exportBody(repo.fullName, { workflow }));
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('secret_in_export');
    expect(res.json().error.details.path).toBe(WORKFLOW_PATH);
    expect(res.body).not.toContain(token);

    await addMemory(pg.handle.db, workspaceId, repo.id, 'repo', `use key sk-${'z'.repeat(30)}`);
    const memRes = await exportCi(agent.id, exportBody(repo.fullName));
    expect(memRes.statusCode).toBe(422);
    expect(memRes.json().error.details.path).toBe('.devdigest/memory.jsonl');
    expect(gh.commits).toHaveLength(0);
  });

  it('AC-3 / repo checks: circle is 422 target_not_supported; unknown agent 404; foreign repo 422', async () => {
    app = await buildCiApp(pg.handle.db, new MockCiGitHub());
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Checks Agent');
    expect((await exportCi(agent.id, exportBody(repo.fullName, { target: 'circle' }))).json().error.code).toBe('target_not_supported');
    expect((await exportCi(GHOST, exportBody(repo.fullName))).statusCode).toBe(404);
    expect((await exportCi(agent.id, exportBody('nobody/else'))).json().error.code).toBe('repo_not_connected');
  });

  describe('AC-16: typed errors, no installation change', () => {
    it('no GitHub token -> 422 github_token_missing', async () => {
      app = await buildCiApp(pg.handle.db, null); // no ciGitHub override, no secrets
      const repo = await seedCiRepo(pg.handle.db, workspaceId);
      const agent = await newAgent(app, 'No Token Agent');
      const res = await exportCi(agent.id, exportBody(repo.fullName));
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('github_token_missing');
      expect(await installations(agent.id)).toHaveLength(0);
    });

    it.each(['contents', 'pull_requests', 'workflows'] as const)('permission %s -> 403 github_permission', async (permission) => {
      const gh = new MockCiGitHub();
      gh.failOn.set(permission === 'pull_requests' ? 'openPr' : 'commit', new CiGitHubError('permission', 'denied', permission));
      app = await buildCiApp(pg.handle.db, gh);
      const repo = await seedCiRepo(pg.handle.db, workspaceId);
      const agent = await newAgent(app, `Perm Agent ${permission}`);
      const res = await exportCi(agent.id, exportBody(repo.fullName));
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toMatchObject({ code: 'github_permission', details: { permission } });
      expect(await installations(agent.id)).toHaveLength(0);
    });

    it.each(['network', 'rate_limited', 'auth', 'unexpected'] as const)('%s -> 502 github_error', async (kind) => {
      const gh = new MockCiGitHub();
      gh.failOn.set('openPr', new CiGitHubError(kind, 'boom'));
      app = await buildCiApp(pg.handle.db, gh);
      const repo = await seedCiRepo(pg.handle.db, workspaceId);
      const agent = await newAgent(app, `Err Agent ${kind}`);
      const res = await exportCi(agent.id, exportBody(repo.fullName));
      expect(res.statusCode).toBe(502);
      expect(res.json().error.code).toBe('github_error');
      expect(await installations(agent.id)).toHaveLength(0);
    });

    it('a failed re-export leaves the existing installation untouched', async () => {
      const gh = new MockCiGitHub();
      app = await buildCiApp(pg.handle.db, gh);
      const repo = await seedCiRepo(pg.handle.db, workspaceId);
      const agent = await newAgent(app, 'Stable Agent');
      await exportCi(agent.id, exportBody(repo.fullName));
      gh.failOn.set('commit', new CiGitHubError('network', 'down'));
      expect((await exportCi(agent.id, exportBody(repo.fullName, { post_as: 'none' }))).statusCode).toBe(502);
      expect((await installations(agent.id))[0].post_as).toBe('github_review');
    });
  });

  it('validates the body: no triggers is a 422 validation_error', async () => {
    app = await buildCiApp(pg.handle.db, new MockCiGitHub());
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Validation Agent');
    const res = await exportCi(agent.id, exportBody(repo.fullName, { triggers: [] }));
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
  });
});
