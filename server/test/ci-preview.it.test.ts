import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockCiGitHub, MockSecretsProvider } from '../src/adapters/mocks.js';
import { CiGitHubError } from '../src/modules/ci/ports.js';
import { GHOST } from './helpers/eval.js';
import {
  addMemory,
  buildCiApp,
  installDirect,
  linkSkill,
  newAgent,
  previewBody,
  seedCiRepo,
  workflowWith,
  WORKFLOW_PATH,
} from './helpers/ci.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci-preview] Docker not available — skipping integration tests.');
}

d('POST /agents/:id/ci/preview (Testcontainers pg)', () => {
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

  const post = (agentId: string, body: unknown) =>
    app!.inject({ method: 'POST', url: `/agents/${agentId}/ci/preview`, payload: body as object });

  it('AC-3: a non-gha target is 422 target_not_supported', async () => {
    app = await buildCiApp(pg.handle.db, new MockCiGitHub());
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Target Agent');
    const res = await post(agent.id, previewBody(repo.fullName, { target: 'circle' }));
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('target_not_supported');
  });

  it('404 for an unknown agent and 422 repo_not_connected for a repo outside the workspace', async () => {
    app = await buildCiApp(pg.handle.db, new MockCiGitHub());
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Tenancy Agent');
    expect((await post(GHOST, previewBody(repo.fullName))).statusCode).toBe(404);
    const res = await post(agent.id, previewBody('stranger/not-connected'));
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('repo_not_connected');
  });

  it('AC-4/5/6: lists files in order, only the workflow editable, manifest with the OpenRouter id note', async () => {
    app = await buildCiApp(pg.handle.db, new MockCiGitHub());
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Preview Agent');
    await linkSkill(pg.handle.db, workspaceId, agent.id, 'Naming Rules', 'be consistent', 0);
    await linkSkill(pg.handle.db, workspaceId, agent.id, 'Naming rules!', 'other body', 1);

    const res = await post(agent.id, previewBody(repo.fullName));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.files.map((f: { path: string }) => f.path)).toEqual([
      '.devdigest/agents/preview-agent.yaml',
      '.devdigest/skills/naming-rules.md',
      '.devdigest/skills/naming-rules-2.md',
      '.devdigest/memory.jsonl',
      '.devdigest/runner/index.js',
      WORKFLOW_PATH,
    ]);
    expect(body.files.map((f: { editable: boolean }) => f.editable)).toEqual([false, false, false, false, false, true]);
    expect(body.files[0].contents).toContain('model: openai/gpt-4.1');
    expect(body.files[0].contents).toContain('- naming-rules-2');
    expect(body.notes).toEqual([{ kind: 'openrouter_id', id: 'openai/gpt-4.1' }]);
    expect(body.agent_slug).toBe('preview-agent');
    expect(body.manifest_version).toBe(1);
    expect(body.install_block).toBeNull();
  });

  it('AC-7: memory export has global + this repo only, only kind/scope/content', async () => {
    app = await buildCiApp(pg.handle.db, new MockCiGitHub());
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const other = await seedCiRepo(pg.handle.db, workspaceId);
    await addMemory(pg.handle.db, workspaceId, null, 'global', 'global rule');
    await addMemory(pg.handle.db, workspaceId, repo.id, 'repo', 'this repo rule');
    await addMemory(pg.handle.db, workspaceId, other.id, 'repo', 'other repo rule');
    await addMemory(pg.handle.db, workspaceId, null, 'team', 'team rule');
    const agent = await newAgent(app, 'Memory Agent');

    const body = (await post(agent.id, previewBody(repo.fullName))).json();
    const memory = body.files.find((f: { path: string }) => f.path === '.devdigest/memory.jsonl').contents as string;
    const items = memory.trimEnd().split('\n').map((l) => JSON.parse(l));
    expect(items.map((i) => i.content).sort()).toEqual(['global rule', 'this repo rule']);
    for (const i of items) expect(Object.keys(i).sort()).toEqual(['content', 'kind', 'scope']);
    expect(memory).not.toContain('other repo rule');
    expect(memory).not.toContain('0.5');
  });

  it('AC-7: no memory gives an empty file', async () => {
    app = await buildCiApp(pg.handle.db, new MockCiGitHub());
    await pg.handle.db.delete(t.memory); // global items from the previous test would match
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'No Memory Agent');
    const body = (await post(agent.id, previewBody(repo.fullName))).json();
    expect(body.files.find((f: { path: string }) => f.path === '.devdigest/memory.jsonl').contents).toBe('');
  });

  it.each([
    ['ready', 'ready'],
    ['not_set', 'not_set'],
  ] as const)('AC-11: secret %s', async (status, expected) => {
    const gh = new MockCiGitHub();
    gh.secrets.set('OPENROUTER_API_KEY', status);
    app = await buildCiApp(pg.handle.db, gh);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, `Secret Agent ${status}`);
    const body = (await post(agent.id, previewBody(repo.fullName))).json();
    expect(body.secrets).toEqual([
      { name: 'OPENROUTER_API_KEY', status: expected },
      { name: 'GITHUB_TOKEN', status: 'ready' },
    ]);
  });

  it('AC-11 / 4.2: Preview never fails because of GitHub (forbidden secret -> unknown, pr_open false)', async () => {
    const gh = new MockCiGitHub();
    gh.failOn.set('secretStatus', new CiGitHubError('permission', 'no'));
    gh.failOn.set('getBranchHead', new CiGitHubError('network', 'down'));
    gh.failOn.set('findOpenPr', new CiGitHubError('rate_limited', 'slow down'));
    app = await buildCiApp(pg.handle.db, gh);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Offline Agent');
    const res = await post(agent.id, previewBody(repo.fullName));
    expect(res.statusCode).toBe(200);
    expect(res.json().secrets[0]).toEqual({ name: 'OPENROUTER_API_KEY', status: 'unknown' });
    expect(res.json().pr_open).toBe(false);
  });

  it('Preview without any GitHub token still returns (secret unknown)', async () => {
    app = await buildCiApp(pg.handle.db, null);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Tokenless Agent');
    const res = await post(agent.id, previewBody(repo.fullName));
    expect(res.statusCode).toBe(200);
    expect(res.json().secrets[0].status).toBe('unknown');
  });

  it('AC-4: the workflow pane shows the whole file incl. another agent’s job, unchanged; no install block (AC-31 retired)', async () => {
    const existing = workflowWith('alpha');
    const gh = new MockCiGitHub({ files: { [WORKFLOW_PATH]: existing } });
    app = await buildCiApp(pg.handle.db, gh);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const a = await newAgent(app, 'Alpha');
    const b = await newAgent(app, 'Beta');
    await installDirect(pg.handle.db, { agentId: a.id, repo: repo.fullName, slug: 'alpha' });

    const body = (await post(b.id, previewBody(repo.fullName))).json();
    const wf = body.files.find((f: { path: string }) => f.path === WORKFLOW_PATH).contents as string;
    expect(wf).toContain(existing.slice(existing.indexOf('  alpha:')).trimEnd());
    expect(wf).toContain('  beta:');
    expect(body.install_block).toBeNull();
  });

  it('install_block is agent_slug_conflict when another agent already uses the slug', async () => {
    app = await buildCiApp(pg.handle.db, new MockCiGitHub());
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const a = await newAgent(app, 'Twin');
    const b = await newAgent(app, 'Twin');
    await installDirect(pg.handle.db, { agentId: a.id, repo: repo.fullName, slug: 'twin' });
    expect((await post(b.id, previewBody(repo.fullName))).json().install_block).toBe('agent_slug_conflict');
  });

  it('pr_open reflects an open devdigest/ci PR', async () => {
    const gh = new MockCiGitHub();
    gh.prs.push({ number: 5, url: 'https://github.com/acme/r/pull/5', head: 'devdigest/ci', base: 'main', title: 't', state: 'open' });
    app = await buildCiApp(pg.handle.db, gh);
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Open Pr Agent');
    expect((await post(agent.id, previewBody(repo.fullName))).json().pr_open).toBe(true);
  });

  it('D-2: a missing runner bundle is 500 runner_bundle_missing', async () => {
    app = await buildApp({
      config: {
        ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
        logLevel: 'silent',
        ciRunnerBundlePath: '/nonexistent/devdigest-runner/index.js',
      },
      db: pg.handle.db,
      overrides: { secrets: new MockSecretsProvider({}), ciGitHub: new MockCiGitHub() },
    });
    const repo = await seedCiRepo(pg.handle.db, workspaceId);
    const agent = await newAgent(app, 'Bundle Agent');
    const res = await post(agent.id, previewBody(repo.fullName));
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('runner_bundle_missing');
  });
});
