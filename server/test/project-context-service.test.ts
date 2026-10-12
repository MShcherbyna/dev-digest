/**
 * ProjectContextService with in-memory fake ports (store + MockRepoDocsSource).
 * Covers discovery (AC-1/3/5/9/36), the file endpoint rules, attachment writes
 * (AC-30) and run-time resolution (AC-24/28, observability log lines).
 */
import { describe, it, expect } from 'vitest';
import { ProjectContextService } from '../src/modules/project-context/service.js';
import { resolveGlob } from '../src/modules/project-context/glob.js';
import { MAX_DOC_BYTES } from '../src/modules/project-context/constants.js';
import type {
  ProjectContextStore,
  RepoLocation,
  UsedByRow,
} from '../src/modules/project-context/ports.js';
import { MockRepoDocsSource, type MockRepoDocsFiles } from '../src/adapters/mocks.js';
import { AppError } from '../src/platform/errors.js';

const WS = 'ws-1';
const REPO: RepoLocation = { id: 'repo-1', owner: 'acme', name: 'api', clonePath: '/clones/acme/api' };

const REPO_B: RepoLocation = { id: 'repo-2', owner: 'acme', name: 'web', clonePath: '/clones/acme/web' };
const key = (id: string, repoId: string) => `${id}|${repoId}`;

class FakeStore implements ProjectContextStore {
  /** Lists keyed by (id, repoId); known ids are tracked separately (agentExists/skillExists). */
  agentIds = new Set<string>();
  skillIds = new Set<string>();
  agents = new Map<string, string[]>();
  skills = new Map<string, string[]>();
  /** Per-repo used-by rows. */
  usedByRepo = new Map<string, UsedByRow[]>();
  usedByCalls: string[] = [];
  writes = 0;
  repos: RepoLocation[];
  constructor(repo: RepoLocation | undefined = REPO, extra: RepoLocation[] = []) {
    this.repos = repo ? [repo, ...extra] : extra;
  }
  /** Seed an agent list (registers the agent). */
  setA(id: string, repoId: string, paths: string[]) {
    this.agentIds.add(id);
    this.agents.set(key(id, repoId), paths);
  }
  setS(id: string, repoId: string, paths: string[]) {
    this.skillIds.add(id);
    this.skills.set(key(id, repoId), paths);
  }
  set used(rows: UsedByRow[]) {
    this.usedByRepo.set(REPO.id, rows);
  }
  async getRepo(ws: string, id: string) {
    return ws === WS ? this.repos.find((r) => r.id === id) : undefined;
  }
  async agentExists(ws: string, id: string) {
    return ws === WS && this.agentIds.has(id);
  }
  async skillExists(ws: string, id: string) {
    return ws === WS && this.skillIds.has(id);
  }
  async getAgentPaths(id: string, repoId: string) {
    return this.agents.get(key(id, repoId)) ?? [];
  }
  async setAgentPaths(id: string, repoId: string, paths: string[]) {
    this.writes++;
    this.agents.set(key(id, repoId), paths);
    return paths;
  }
  async getSkillPaths(id: string, repoId: string) {
    return this.skills.get(key(id, repoId)) ?? [];
  }
  async setSkillPaths(id: string, repoId: string, paths: string[]) {
    this.writes++;
    this.skills.set(key(id, repoId), paths);
    return paths;
  }
  async usedByRows(_ws: string, repoId: string) {
    this.usedByCalls.push(repoId);
    return this.usedByRepo.get(repoId) ?? [];
  }
  async skillPathsFor(ids: string[], repoId: string) {
    return new Map(ids.map((i) => [i, this.skills.get(key(i, repoId)) ?? []] as const));
  }
}

function make(files: MockRepoDocsFiles | null, opts: { store?: FakeStore; glob?: string } = {}) {
  const store = opts.store ?? new FakeStore();
  const warns: string[] = [];
  const svc = new ProjectContextService({
    store,
    docs: new MockRepoDocsSource(files),
    glob: resolveGlob(opts.glob),
    log: { warn: (m) => warns.push(m) },
  });
  return { svc, store, warns };
}

async function status(p: Promise<unknown>): Promise<number | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return e instanceof AppError ? e.statusCode : -1;
  }
}

describe('discover', () => {
  it('AC-1/5/9: lists only matching, non-excluded docs sorted by path with type, tokens, too_large, used_by', async () => {
    // Catches: excluded dirs / INSIGHTS.md leaking in, wrong type or token rule, used_by not folded in.
    const { svc, store } = make({
      'specs/a.md': 'aaaaaaaa', // 8 chars -> 2 tokens
      'server/docs/b.md': 'bbbb',
      '.devdigest/specs/c.md': 'c',
      'node_modules/x/docs/d.md': 'nope',
      'INSIGHTS.md': 'nope',
      'docs/huge.md': { size: MAX_DOC_BYTES + 1 },
    });
    store.used = [
      { agentId: 'A1', paths: ['specs/a.md'] },
      { agentId: 'A2', paths: ['specs/a.md', 'docs/huge.md'] },
    ];
    const r = await svc.discover(WS, REPO.id);
    expect(r.cloned).toBe(true);
    expect(r.truncated).toBe(false);
    expect(r.total).toBe(4);
    expect(r.files.map((f) => f.path)).toEqual([
      '.devdigest/specs/c.md',
      'docs/huge.md',
      'server/docs/b.md',
      'specs/a.md',
    ]);
    const a = r.files.find((f) => f.path === 'specs/a.md')!;
    expect(a).toMatchObject({ type: 'specs', size: 8, tokens: 2, too_large: false, used_by: 2 });
    const huge = r.files.find((f) => f.path === 'docs/huge.md')!;
    expect(huge).toMatchObject({
      type: 'docs',
      too_large: true,
      tokens: Math.ceil((MAX_DOC_BYTES + 1) / 4),
      used_by: 1,
    });
    expect(r.files.find((f) => f.path === 'server/docs/b.md')!.used_by).toBe(0);
  });

  it('AC-9: discover asks the store for used-by rows of the requested repo only', async () => {
    // Catches: used_by counted across all repos instead of the listed one.
    const store = new FakeStore(REPO, [REPO_B]);
    store.usedByRepo.set(REPO.id, [{ agentId: 'A1', paths: ['docs/a.md'] }]);
    store.usedByRepo.set(REPO_B.id, [
      { agentId: 'A1', paths: ['docs/a.md'] },
      { agentId: 'A2', paths: ['docs/a.md'] },
    ]);
    const { svc } = make({ 'docs/a.md': 'x' }, { store });
    expect((await svc.discover(WS, REPO.id)).files[0]!.used_by).toBe(1);
    expect((await svc.discover(WS, REPO_B.id)).files[0]!.used_by).toBe(2);
    expect(store.usedByCalls).toEqual([REPO.id, REPO_B.id]);
  });

  it('AC-36: 2,001 matches return 2,000 sorted entries, truncated, total 2001', async () => {
    // Catches: unbounded response / missing truncated flag.
    const files: MockRepoDocsFiles = {};
    for (let i = 0; i < 2001; i++) files[`docs/f${String(i).padStart(4, '0')}.md`] = 'x';
    const r = await make(files).svc.discover(WS, REPO.id);
    expect(r.files).toHaveLength(2000);
    expect(r.truncated).toBe(true);
    expect(r.total).toBe(2001);
    expect(r.files[0]!.path).toBe('docs/f0000.md');
  });

  it('drops paths with quote/control characters so they can never become a prompt label', async () => {
    // Catches: a hostile file name breaking the `<untrusted source="...">` label.
    const r = await make({ 'docs/a"b.md': 'x', 'docs/ok.md': 'x' }).svc.discover(WS, REPO.id);
    expect(r.files.map((f) => f.path)).toEqual(['docs/ok.md']);
  });

  it('no clone or missing clone dir -> cloned:false and no files; foreign repo -> 404', async () => {
    // Catches: an error/500 instead of the "not cloned yet" state; cross-workspace leak.
    const noClone = new FakeStore({ ...REPO, clonePath: null });
    expect(await make({ 'docs/a.md': 'x' }, { store: noClone }).svc.discover(WS, REPO.id)).toMatchObject({
      cloned: false,
      files: [],
      total: 0,
    });
    expect(await make(null).svc.discover(WS, REPO.id)).toMatchObject({ cloned: false, files: [] });
    expect(await status(make({}).svc.discover('other-ws', REPO.id))).toBe(404);
  });

  it('AC-2/3: a custom glob is used; an invalid one falls back to default and warns once, naming the value', async () => {
    const files = { 'adr/0001.md': 'x', 'docs/a.md': 'x' };
    const custom = await make(files, { glob: '**/adr/**/*.md' }).svc.discover(WS, REPO.id);
    expect(custom.glob).toBe('**/adr/**/*.md');
    expect(custom.files.map((f) => f.path)).toEqual(['adr/0001.md']);

    const bad = make(files, { glob: 'docs/[ab].md' });
    const r = await bad.svc.discover(WS, REPO.id);
    await bad.svc.discover(WS, REPO.id);
    expect(r.files.map((f) => f.path)).toEqual(['docs/a.md']);
    expect(bad.warns).toHaveLength(1);
    expect(bad.warns[0]).toContain('docs/[ab].md');
  });
});

describe('readFile', () => {
  const files = { 'specs/a.md': 'hello world', '.env': 'SECRET=1', 'docs/big.md': { size: MAX_DOC_BYTES + 1 } };

  it('serves a discoverable doc with size and tokens', async () => {
    const r = await make(files).svc.readFile(WS, REPO.id, 'specs/a.md');
    expect(r).toEqual({ path: 'specs/a.md', content: 'hello world', size: 11, tokens: 3 });
  });

  it('refuses non-discoverable files and invalid paths (NFR: no route reads .env); maps too_large to 413', async () => {
    // Catches: the file endpoint becoming an arbitrary clone-file reader; wrong status codes.
    const { svc } = make({ ...files, 'node_modules/x/docs/d.md': 'x' });
    expect(await status(svc.readFile(WS, REPO.id, '.env'))).toBe(400); // not .md
    expect(await status(svc.readFile(WS, REPO.id, 'docs/../.env'))).toBe(400);
    expect(await status(svc.readFile(WS, REPO.id, '../../etc/passwd.md'))).toBe(400);
    expect(await status(svc.readFile(WS, REPO.id, 'README.md'))).toBe(404); // valid but not in glob
    expect(await status(svc.readFile(WS, REPO.id, 'node_modules/x/docs/d.md'))).toBe(404);
    expect(await status(svc.readFile(WS, REPO.id, 'docs/gone.md'))).toBe(404);
    expect(await status(svc.readFile(WS, REPO.id, 'docs/big.md'))).toBe(413);
    expect(await status(svc.readFile('other-ws', REPO.id, 'specs/a.md'))).toBe(404);
  });
});

describe('attachment writes (AC-30/38)', () => {
  const storeWith = () => {
    const store = new FakeStore(REPO, [REPO_B]);
    store.agentIds.add('ag');
    store.skillIds.add('sk');
    return store;
  };

  it('AC-38: lists are independent per repo; an unset repo reads as []', async () => {
    // Catches: a list leaking across repos (the old single-list-per-agent behaviour).
    const store = storeWith();
    const repoC: RepoLocation = { id: 'repo-3', owner: 'acme', name: 'c', clonePath: null };
    store.repos.push(repoC);
    const { svc } = make({}, { store });
    await svc.setAgentContext(WS, 'ag', REPO.id, { paths: ['docs/a.md'] });
    await svc.setAgentContext(WS, 'ag', REPO_B.id, { paths: ['docs/b.md'] });
    await svc.setSkillContext(WS, 'sk', REPO.id, { paths: ['docs/sa.md'] });
    await svc.setSkillContext(WS, 'sk', REPO_B.id, { paths: ['docs/sb.md'] });
    expect(await svc.getAgentContext(WS, 'ag', REPO.id)).toEqual({ paths: ['docs/a.md'] });
    expect(await svc.getAgentContext(WS, 'ag', REPO_B.id)).toEqual({ paths: ['docs/b.md'] });
    expect(await svc.getAgentContext(WS, 'ag', repoC.id)).toEqual({ paths: [] });
    expect(await svc.getSkillContext(WS, 'sk', REPO.id)).toEqual({ paths: ['docs/sa.md'] });
    expect(await svc.getSkillContext(WS, 'sk', REPO_B.id)).toEqual({ paths: ['docs/sb.md'] });
    expect(await svc.getSkillContext(WS, 'sk', repoC.id)).toEqual({ paths: [] });
  });

  it('rejects invalid/duplicate paths with 400 (details name them), writes nothing, keeps the ordered list', async () => {
    // Catches: traversal paths persisted, duplicates accepted, wrong status.
    const store = storeWith();
    const { svc } = make({}, { store });

    for (const bad of [['../../etc/passwd.md'], ['docs/a.md', 'docs/a.md'], ['docs/a.txt']]) {
      expect(await status(svc.setAgentContext(WS, 'ag', REPO.id, { paths: bad }))).toBe(400);
      expect(await status(svc.setSkillContext(WS, 'sk', REPO.id, { paths: bad }))).toBe(400);
    }
    let details: unknown;
    try {
      await svc.setAgentContext(WS, 'ag', REPO.id, { paths: ['docs/a.md', 'docs/a.md', '/x.md'] });
    } catch (e) {
      details = (e as AppError).details;
    }
    expect(details).toEqual({ invalid: ['/x.md'], duplicates: ['docs/a.md'] });
    expect(store.writes).toBe(0);

    expect(await svc.setAgentContext(WS, 'ag', REPO.id, { paths: ['docs/b.md', 'docs/a.md'] })).toEqual({
      paths: ['docs/b.md', 'docs/a.md'],
    });
    expect(await svc.getAgentContext(WS, 'ag', REPO.id)).toEqual({ paths: ['docs/b.md', 'docs/a.md'] });
  });

  it('unknown/foreign agent, skill or repo -> 404 with nothing written; 404 wins over path validation', async () => {
    // Catches: writing against a repo/agent of another workspace; validation details leaking for a foreign id.
    const store = storeWith();
    const { svc } = make({}, { store });
    for (const repoId of ['ghost-repo', 'repo-of-other-ws']) {
      expect(await status(svc.setAgentContext(WS, 'ag', repoId, { paths: [] }))).toBe(404);
      expect(await status(svc.getAgentContext(WS, 'ag', repoId))).toBe(404);
      expect(await status(svc.setSkillContext(WS, 'sk', repoId, { paths: [] }))).toBe(404);
      expect(await status(svc.getSkillContext(WS, 'sk', repoId))).toBe(404);
    }
    expect(await status(svc.setAgentContext(WS, 'ghost', REPO.id, { paths: [] }))).toBe(404);
    expect(await status(svc.getAgentContext(WS, 'ghost', REPO.id))).toBe(404);
    expect(await status(svc.setSkillContext(WS, 'ghost', REPO.id, { paths: [] }))).toBe(404);
    expect(await status(svc.getSkillContext(WS, 'ghost', REPO.id))).toBe(404);
    expect(await status(svc.setAgentContext('other-ws', 'ag', REPO.id, { paths: [] }))).toBe(404);
    // foreign agent / unknown repo combined with invalid paths -> 404, not 400
    expect(await status(svc.setAgentContext(WS, 'ghost', REPO.id, { paths: ['../x.md'] }))).toBe(404);
    expect(await status(svc.setSkillContext(WS, 'sk', 'ghost-repo', { paths: ['../x.md'] }))).toBe(404);
    expect(store.writes).toBe(0);
  });
});

describe('resolveForRun', () => {
  const input = (clonePath: string | null = REPO.clonePath) => ({
    workspaceId: WS,
    agentId: 'ag',
    repoId: REPO.id,
    clonePath,
    skills: [
      { id: 's1', name: 'S1' },
      { id: 's2', name: 'S2' },
    ],
  });

  it('AC-24: agent [a,b] + skill [b,c] -> a,b,c with origins; later skill docs follow', async () => {
    // Catches: wrong order / lost origin / duplicate included twice.
    const store = new FakeStore();
    store.setA('ag', REPO.id, ['docs/a.md', 'docs/b.md']);
    store.setS('s1', REPO.id, ['docs/b.md', 'docs/c.md']);
    store.setS('s2', REPO.id, ['docs/d.md']);
    const { svc } = make({ 'docs/a.md': 'A', 'docs/b.md': 'B', 'docs/c.md': 'C', 'docs/d.md': 'D' }, { store });
    const logs: string[] = [];
    const r = await svc.resolveForRun(input(), (m) => logs.push(m));
    expect(r.docs.map((d) => d.path)).toEqual(['docs/a.md', 'docs/b.md', 'docs/c.md', 'docs/d.md']);
    expect(r.entries.map((e) => [e.path, e.origin, e.skill])).toEqual([
      ['docs/a.md', 'agent', undefined],
      ['docs/b.md', 'agent', undefined],
      ['docs/c.md', 'skill', 'S1'],
      ['docs/d.md', 'skill', 'S2'],
    ]);
    expect(r.entries.every((e) => e.status === 'included' && e.tokens === 1)).toBe(true);
    expect(logs).toEqual(['project context: 4 included, 0 skipped']);
  });

  it('AC-28: classifies all five skip reasons, keeps going, and logs summary + one line per skip', async () => {
    // Catches: a bad doc failing the run, a misclassified reason, missing observability lines.
    const store = new FakeStore();
    store.setA('ag', REPO.id, ['docs/ok.md', 'docs/missing.md', 'docs/big.md', '../x.md', 'docs/bin.md', 'docs/blank.md']);
    const { svc } = make(
      {
        'docs/ok.md': 'fine',
        'docs/big.md': { size: MAX_DOC_BYTES + 1 },
        'docs/bin.md': 'unreadable',
        'docs/blank.md': ' \n\t ',
      },
      { store },
    );
    const logs: string[] = [];
    const r = await svc.resolveForRun(input(), (m) => logs.push(m));
    expect(r.docs.map((d) => d.path)).toEqual(['docs/ok.md']);
    expect(r.entries.map((e) => [e.path, e.status, e.reason])).toEqual([
      ['docs/ok.md', 'included', undefined],
      ['docs/missing.md', 'skipped', 'missing'],
      ['docs/big.md', 'skipped', 'too_large'],
      ['../x.md', 'skipped', 'invalid_path'],
      ['docs/bin.md', 'skipped', 'unreadable'],
      ['docs/blank.md', 'skipped', 'empty'],
    ]);
    expect(logs).toEqual([
      'project context: 1 included, 5 skipped',
      'project context: skipped docs/missing.md (missing)',
      'project context: skipped docs/big.md (too_large)',
      'project context: skipped ../x.md (invalid_path)',
      'project context: skipped docs/bin.md (unreadable)',
      'project context: skipped docs/blank.md (empty)',
    ]);
  });

  it('a repo with no clone skips every path as missing; nothing attached -> empty result and a zero-count log line', async () => {
    // Catches: a no-clone repo crashing the run; the per-run log line missing when nothing is attached.
    const store = new FakeStore();
    store.setA('ag', REPO.id, ['docs/a.md']);
    const { svc } = make({ 'docs/a.md': 'A' }, { store });
    const none = await svc.resolveForRun(input(null), () => undefined);
    expect(none.docs).toEqual([]);
    expect(none.entries).toEqual([{ path: 'docs/a.md', origin: 'agent', status: 'skipped', reason: 'missing' }]);

    store.setA('ag', REPO.id, []);
    const logs: string[] = [];
    expect(await svc.resolveForRun(input(), (m) => logs.push(m))).toEqual({ docs: [], entries: [] });
    expect(logs).toEqual(['project context: 0 included, 0 skipped']);
  });

  it('AC-24: only the PR repo lists are used; lists stored for another repo never reach the run', async () => {
    // Catches: resolveForRun reading another repo's agent or skill list (cross-repo prompt leak).
    const store = new FakeStore(REPO, [REPO_B]);
    store.setA('ag', REPO.id, ['docs/a.md']);
    store.setA('ag', REPO_B.id, ['docs/x.md']);
    store.setS('s1', REPO.id, ['docs/c.md']);
    store.setS('s1', REPO_B.id, ['docs/y.md']);
    const { svc } = make({ 'docs/a.md': 'A', 'docs/c.md': 'C', 'docs/x.md': 'X', 'docs/y.md': 'Y' }, { store });
    const r = await svc.resolveForRun(input(), () => undefined);
    expect(r.docs.map((d) => d.path)).toEqual(['docs/a.md', 'docs/c.md']);
    const b = await svc.resolveForRun({ ...input(), repoId: REPO_B.id }, () => undefined);
    expect(b.docs.map((d) => d.path)).toEqual(['docs/x.md', 'docs/y.md']);

    // an agent with lists only for repo B contributes nothing on repo A
    const onlyB = new FakeStore(REPO, [REPO_B]);
    onlyB.setA('ag', REPO_B.id, ['docs/x.md']);
    const res = await make({ 'docs/x.md': 'X' }, { store: onlyB }).svc.resolveForRun(input(), () => undefined);
    expect(res).toEqual({ docs: [], entries: [] });
  });
});
