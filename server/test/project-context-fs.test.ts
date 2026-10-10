/**
 * FsRepoDocsSource against a real tmp-dir clone: the security boundary
 * (AC-4 symlinks, AC-28 reasons, fail-closed reads). No DB, no Docker.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsRepoDocsSource } from '../src/adapters/repo-docs/fs.js';
import { EXCLUDED_DIRS } from '../src/modules/project-context/constants.js';

const EXCLUDED = new Set<string>(EXCLUDED_DIRS);
const isDoc = (p: string) => p.endsWith('.md');

describe('FsRepoDocsSource', () => {
  let base: string;
  let root: string;
  const fsrc = new FsRepoDocsSource();

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'pc-fs-'));
    root = join(base, 'clone');
    const outside = join(base, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'secret.md'), 'TOP SECRET');
    for (const d of ['specs', 'server/docs', '.devdigest/specs', 'node_modules/x/docs', 'vendor/docs', 'docs']) {
      await mkdir(join(root, d), { recursive: true });
    }
    await writeFile(join(root, 'specs/a.md'), 'alpha');
    await writeFile(join(root, 'server/docs/b.md'), 'bravo');
    await writeFile(join(root, '.devdigest/specs/c.md'), 'charlie');
    await writeFile(join(root, 'node_modules/x/docs/d.md'), 'excluded');
    await writeFile(join(root, 'vendor/docs/e.md'), 'excluded');
    await writeFile(join(root, 'INSIGHTS.md'), 'root');
    await writeFile(join(root, 'docs/bad.md'), Buffer.from([0xff, 0xfe, 0x41]));
    await writeFile(join(root, 'docs/big.md'), 'x'.repeat(100));
    // symlinks: a file, a directory, and a link to a file outside the clone
    await symlink('/etc/hosts', join(root, 'docs/evil.md'));
    await symlink(outside, join(root, 'docs/linked'));
    await symlink(join(root, 'specs/a.md'), join(root, 'docs/inside-link.md'));
  });
  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('AC-1/4: walk lists regular docs (hidden dirs included), skips excluded dirs and every symlink', async () => {
    // Catches: following a symlinked dir/file out of the clone, or entering node_modules/vendor.
    const found = await fsrc.walk(root, EXCLUDED, isDoc);
    const paths = (found ?? []).map((f) => f.path).sort();
    expect(paths).toEqual([
      'INSIGHTS.md',
      '.devdigest/specs/c.md',
      'docs/bad.md',
      'docs/big.md',
      'server/docs/b.md',
      'specs/a.md',
    ].sort());
    expect(found!.find((f) => f.path === 'specs/a.md')!.size).toBe(5);
    expect(await fsrc.walk(join(base, 'nope'), EXCLUDED, isDoc)).toBeNull();
  });

  it('read: ok for a regular file; missing / too_large / unreadable (non-UTF-8) classified', async () => {
    // Catches: replacement characters sent to the model, size cap not applied before reading.
    expect(await fsrc.read(root, 'specs/a.md', 1024)).toEqual({ kind: 'ok', content: 'alpha' });
    expect(await fsrc.read(root, 'specs/none.md', 1024)).toEqual({ kind: 'missing' });
    expect(await fsrc.read(root, 'docs/big.md', 99)).toEqual({ kind: 'too_large' });
    expect(await fsrc.read(root, 'docs/bad.md', 1024)).toEqual({ kind: 'unreadable' });
    expect(await fsrc.read(join(base, 'nope'), 'specs/a.md', 1024)).toEqual({ kind: 'missing' });
    expect(await fsrc.read(root, 'docs', 1024)).toEqual({ kind: 'unreadable' }); // not a regular file
  });

  it('read fails closed on symlinks: outside-the-clone is invalid_path, inside is refused too', async () => {
    // Catches: a stored path through a symlink reading /etc/hosts or another file outside the clone (AC-4/28).
    const evil = await fsrc.read(root, 'docs/evil.md', 1 << 20);
    expect(evil.kind).toBe('invalid_path');
    expect((await fsrc.read(root, 'docs/linked/secret.md', 1 << 20)).kind).toBe('invalid_path');
    expect((await fsrc.read(root, 'docs/inside-link.md', 1 << 20)).kind).toBe('unreadable');
    for (const p of ['docs/evil.md', 'docs/linked/secret.md']) {
      expect(await fsrc.read(root, p, 1 << 20)).not.toMatchObject({ kind: 'ok' });
    }
  });
});
