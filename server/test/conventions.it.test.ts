import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const files = {
  'tsconfig.json': '{\n  "compilerOptions": { "strict": true }\n}',
  'src/order.ts': '@Entity("orders")\nexport class Order {}\n',
  'src/ticket.ts': '@Entity("tickets")\nexport class Ticket {}\n',
};

const extraction = {
  conventions: [
    { rule: 'Use entity decorators', evidence: { file: 'src/order.ts', line: 1, code: '@Entity("orders")' }, confidence: 0.9 },
    { rule: 'Use entity decorators', evidence: { file: 'src/ticket.ts', line: 1, code: '@Entity("tickets")' }, confidence: 0.85 },
    { rule: 'Invented file', evidence: { file: 'src/ghost.ts', line: 1 }, confidence: 0.9 },
    { rule: 'Invented line', evidence: { file: 'src/order.ts', line: 500 }, confidence: 0.9 },
    { rule: 'Path traversal', evidence: { file: '../../etc/passwd', line: 1 }, confidence: 0.9 },
  ],
};

/** Conventions module: extract (evidence verification), accept/edit/reject, create skill from accepted. */
d('conventions module', () => {
  let pg: PgFixture;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).limit(1);
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'shop', fullName: 'acme/shop' })
      .returning();
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const repoIntel = {
      getConventionSamples: async () => ['src/order.ts', 'src/ticket.ts'],
    } as unknown as RepoIntel;
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files }),
        github: new MockGitHubClient(),
        repoIntel,
        llm: {
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: { ConventionExtraction: extraction },
          }),
        },
      },
    });
  }

  it('extract drops candidates with unverifiable evidence and keeps real ones', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.head_sha).toBeTruthy();
    expect(body.conventions.map((c: { evidence_path: string }) => c.evidence_path).sort()).toEqual([
      'src/order.ts',
      'src/ticket.ts',
    ]);
    expect(body.conventions[0]).toMatchObject({ accepted: false, evidence_line: 1 });
  });

  it('accept/edit/reject, create skill contains only accepted, re-scan resets everything', async () => {
    const app = await makeApp();
    const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    const [a, b] = list.conventions;

    const edited = await app.inject({
      method: 'PATCH',
      url: `/conventions/${a.id}`,
      payload: { accepted: true, rule: 'Always use entity decorators' },
    });
    expect(edited.json()).toMatchObject({ accepted: true, rule: 'Always use entity decorators' });

    // accepted ones are listed before pending ones
    const ordered = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    expect(ordered.conventions[0].id).toBe(a.id);

    expect((await app.inject({ method: 'DELETE', url: `/conventions/${b.id}` })).statusCode).toBe(200);
    const after = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    expect(after.conventions).toHaveLength(1);
    expect(after.conventions[0].id).toBe(a.id);

    const skill = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { name: 'shop-conventions', description: 'd', convention_ids: [a.id] },
    });
    expect(skill.statusCode).toBe(201);
    expect(skill.json()).toMatchObject({ type: 'convention', source: 'extracted', version: 1 });
    expect(skill.json().body).toContain('Always use entity decorators');
    expect(skill.json().body).not.toContain('Invented');

    // A user-edited body wins over the generated one.
    const custom = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { name: 'custom-body', convention_ids: [a.id], body: '# My edited skill' },
    });
    expect(custom.statusCode).toBe(201);
    expect(custom.json().body).toBe('# My edited skill');

    // Re-scan resets: the accepted (edited) convention is gone, all fresh ones are pending.
    const rescan = (
      await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })
    ).json();
    expect(rescan.conventions).toHaveLength(2);
    expect(rescan.conventions.some((c: { id: string }) => c.id === a.id)).toBe(false);
    expect(rescan.conventions.every((c: { accepted: boolean }) => !c.accepted)).toBe(true);
  });

  it('create skill with no accepted convention is a 422', async () => {
    const app = await makeApp();
    const pending = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` }))
      .json()
      .conventions.find((c: { accepted: boolean }) => !c.accepted);
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { name: 'x', convention_ids: [pending.id] },
    });
    expect(res.statusCode).toBe(422);
  });
});
