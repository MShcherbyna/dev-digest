/** Pure grounding / validation rules of the onboarding module (AC-7..9, 12, 29, 33). */
import { describe, it, expect } from 'vitest';
import {
  countUnverifiedProsePaths,
  extractProsePaths,
  groundCriticalPaths,
  groundFirstTasks,
  groundReadingPath,
  isStale,
  toIndexSummary,
  validateDiagram,
  type KindOf,
} from '../src/modules/onboarding/helpers.js';
import type { FsKind, IndexSnapshot } from '../src/modules/onboarding/ports.js';
import type { OnboardingTour } from '../src/modules/onboarding/schemas.js';

/** Async fake kindOf backed by a map; unknown paths are `missing`. */
const kindFrom =
  (m: Record<string, FsKind>): KindOf =>
  async (rel) =>
    m[rel] ?? 'missing';

describe('onboarding grounding', () => {
  it('AC-7: keeps a real file, drops missing / unsafe / symlinked paths', async () => {
    // Catches: a hallucinated or traversal path (or a symlink out of the clone) surviving into the stored tour.
    const kindOf = kindFrom({ 'src/real.ts': 'file', 'src/link.ts': 'invalid' });
    const items = ['src/real.ts', 'src/ghost.ts', '../etc/passwd', 'src/link.ts'].map((path) => ({
      path,
      description: 'd',
    }));
    const r = await groundCriticalPaths(items, kindOf);
    expect(r.kept.map((i) => i.path)).toEqual(['src/real.ts']);
    expect(r.droppedInvalid).toBe(3);
    expect(r.droppedOverflow).toBe(0);
  });

  it('AC-7: a directory is not an acceptable reading-path entry', async () => {
    // Catches: reading_path accepting directories (only first tasks may point at them).
    const r = await groundReadingPath(
      [
        { path: 'specs', reason: 'x' },
        { path: 'README.md', reason: 'y' },
      ],
      kindFrom({ specs: 'directory', 'README.md': 'file' }),
    );
    expect(r.kept.map((i) => i.path)).toEqual(['README.md']);
  });

  it('AC-8: first tasks classify file / directory / new_file and drop an orphan new file', async () => {
    // Catches: a new-file suggestion under a directory that does not exist, or a wrong path_kind.
    const kindOf = kindFrom({
      'src/real.ts': 'file',
      specs: 'directory',
      'src/api': 'directory',
      'src/api/public': 'directory',
    });
    const mk = (path: string) => ({ title: `t ${path}`, path, complexity: 'low' as const });
    const r = await groundFirstTasks(
      [mk('src/real.ts'), mk('specs/'), mk('src/api/public/health.ts'), mk('nowhere/x.ts')],
      kindOf,
    );
    expect(r.kept.map((t) => [t.path, t.path_kind])).toEqual([
      ['src/real.ts', 'file'],
      ['specs/', 'directory'], // the model's path is kept as written; only the check normalises it
      ['src/api/public/health.ts', 'new_file'],
    ]);
    expect(r.droppedInvalid).toBe(1);
  });

  it('AC-8: a root-level new file is allowed; a symlink is never a new_file', async () => {
    // Catches: the clone root not counting as an existing parent; `invalid` being treated like `missing`.
    const mk = (path: string) => ({ title: 't', path, complexity: 'low' as const });
    const r = await groundFirstTasks([mk('NEW.md'), mk('evil')], kindFrom({ evil: 'invalid' }));
    expect(r.kept.map((t) => [t.path, t.path_kind])).toEqual([['NEW.md', 'new_file']]);
    expect(r.droppedInvalid).toBe(1);
  });

  it('AC-9: caps 9 critical paths at 6 (reporting overflow) and leaves 2 first tasks alone', async () => {
    // Catches: list caps not enforced / overflow miscounted.
    const files: Record<string, FsKind> = {};
    const items = Array.from({ length: 9 }, (_, i) => {
      files[`src/f${i}.ts`] = 'file';
      return { path: `src/f${i}.ts`, description: 'd' };
    });
    const crit = await groundCriticalPaths(items, kindFrom(files));
    expect(crit.kept).toHaveLength(6);
    expect(crit.droppedOverflow).toBe(3);
    expect(crit.droppedInvalid).toBe(0);

    const tasks = await groundFirstTasks(
      [
        { title: 'a', path: 'src/f0.ts', complexity: 'low' },
        { title: 'b', path: 'src/f1.ts', complexity: 'high' },
      ],
      kindFrom(files),
    );
    expect(tasks.kept).toHaveLength(2);
    expect(tasks.droppedOverflow).toBe(0);
  });
});

describe('validateDiagram', () => {
  const node = (id: string, kind = 'service') => ({ id, label: id.toUpperCase(), kind });

  it('AC-12: six nodes and five edges come back unchanged', () => {
    // Catches: a valid diagram being mutated or truncated.
    const nodes = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => node(id));
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'd' },
      { from: 'd', to: 'e' },
      { from: 'e', to: 'f' },
    ];
    expect(validateDiagram(nodes, edges)).toEqual({ nodes, edges });
  });

  it('AC-29: every structural defect makes the whole graph null', () => {
    // Catches: a broken graph (dangling edge, bad kind, dup id, self loop, over caps) reaching the UI.
    const ok = [node('a'), node('b')];
    expect(validateDiagram(ok, [{ from: 'a', to: 'ghost' }])).toBeNull();
    expect(validateDiagram([], [])).toBeNull();
    expect(validateDiagram([node('a', 'database'), node('b')], [])).toBeNull();
    expect(validateDiagram([node('a'), node('a')], [])).toBeNull();
    expect(validateDiagram(ok, [{ from: 'a', to: 'a' }])).toBeNull();

    const thirteen = Array.from({ length: 13 }, (_, i) => node(`n${i}`));
    expect(validateDiagram(thirteen, [])).toBeNull();

    const twelve = Array.from({ length: 12 }, (_, i) => node(`n${i}`));
    const manyEdges: { from: string; to: string }[] = [];
    for (let i = 0; i < 12 && manyEdges.length < 25; i++) {
      for (let j = 0; j < 12 && manyEdges.length < 25; j++) {
        if (i !== j) manyEdges.push({ from: `n${i}`, to: `n${j}` });
      }
    }
    expect(manyEdges).toHaveLength(25);
    expect(validateDiagram(twelve, manyEdges)).toBeNull();
    expect(validateDiagram(twelve, manyEdges.slice(0, 24))).not.toBeNull();
  });

  it('AC-29: a duplicate edge is removed and the graph stays valid', () => {
    // Catches: duplicate edges invalidating an otherwise fine diagram (or surviving twice).
    const r = validateDiagram([node('a'), node('b')], [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'b' },
    ]);
    expect(r?.edges).toEqual([{ from: 'a', to: 'b' }]);
  });
});

describe('prose paths (AC-33)', () => {
  it('counts a ghost path as unverified and checks a glob as its directory', async () => {
    // Catches: prose being checked with the literal `*` (false positives) or ghost paths going uncounted.
    const prose = 'Entry is `src/ghost.ts`; routes live in `src/api/*`.\n```\n`not/counted.ts`\n```';
    const paths = extractProsePaths(prose);
    expect(paths).toEqual(['src/ghost.ts', 'src/api']);
    const n = await countUnverifiedProsePaths(paths, kindFrom({ 'src/api': 'directory' }));
    expect(n).toBe(1);
  });
});

describe('index mapping and staleness (Q1)', () => {
  const snap = (over: Partial<IndexSnapshot>): IndexSnapshot => ({
    status: 'full',
    filesIndexed: 42,
    lastIndexedSha: 'abc',
    updatedAt: new Date('2026-01-01'),
    ...over,
  });

  it('maps the synthesised never-indexed state to none / null, and a real one through', () => {
    // Catches: a never-indexed repo reporting a fake status and a bogus SHA (-> permanent "stale").
    expect(
      toIndexSummary(
        snap({ status: 'degraded', lastIndexedSha: '', degradedReason: 'no_data', updatedAt: new Date(0), filesIndexed: 0 }),
      ),
    ).toEqual({ status: 'none', last_indexed_sha: null, files_indexed: 0 });
    expect(toIndexSummary(snap({}))).toEqual({ status: 'full', last_indexed_sha: 'abc', files_indexed: 42 });
  });

  it('isStale: false without a tour or without an indexed SHA, false when equal, true when different', () => {
    // Catches: stale notice showing for an unindexed repo or when the commit is unchanged.
    const tour = { commit_sha: 'abc' } as OnboardingTour;
    expect(isStale(null, 'zzz')).toBe(false);
    expect(isStale(tour, null)).toBe(false);
    expect(isStale(tour, 'abc')).toBe(false);
    expect(isStale(tour, 'def')).toBe(true);
  });
});
