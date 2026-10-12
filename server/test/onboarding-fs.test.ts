/** FsRepoFiles.kind / walk against a real tmp-dir clone: the fail-closed symlink boundary (AC-7, AC-8). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsRepoFiles } from '../src/adapters/repo-files/fs.js';

describe('FsRepoFiles', () => {
  let base: string;
  let root: string;
  const fsrc = new FsRepoFiles();

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'ob-fs-'));
    root = join(base, 'clone');
    const outside = join(base, 'outside');
    await mkdir(join(root, 'src'), { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'secret.ts'), 'TOP SECRET');
    await writeFile(join(root, 'src/real.ts'), 'export {}');
    await writeFile(join(root, 'package.json'), '{}');
    await symlink(join(root, 'src/real.ts'), join(root, 'src/inside-link.ts'));
    await symlink('/etc/hosts', join(root, 'src/hosts.ts'));
    await symlink(outside, join(root, 'src/linked'));
  });
  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('kind: file / directory / missing', async () => {
    // Catches: wrong classification, which drives every grounding decision (AC-7/8).
    expect(await fsrc.kind(root, 'src/real.ts')).toBe('file');
    expect(await fsrc.kind(root, 'src')).toBe('directory');
    expect(await fsrc.kind(root, 'src/')).toBe('directory');
    expect(await fsrc.kind(root, 'src/ghost.ts')).toBe('missing');
  });

  it('kind fails closed: any symlink in the chain, an unsafe path or an unreadable root is invalid', async () => {
    // Catches: a model-proposed path through a symlink exposing a file outside the clone as a valid "Open" target.
    expect(await fsrc.kind(root, 'src/inside-link.ts')).toBe('invalid');
    expect(await fsrc.kind(root, 'src/hosts.ts')).toBe('invalid');
    expect(await fsrc.kind(root, 'src/linked')).toBe('invalid');
    expect(await fsrc.kind(root, 'src/linked/secret.ts')).toBe('invalid');
    expect(await fsrc.kind(root, '../outside/secret.ts')).toBe('invalid');
    expect(await fsrc.kind(root, '/etc/hosts')).toBe('invalid');
    expect(await fsrc.kind(join(base, 'nope'), 'src/real.ts')).toBe('invalid');
  });

  it('walk never lists symlinks', async () => {
    // Catches: the walker following/listing links, which would feed outside files to the prompt.
    const found = await fsrc.walk(root, new Set(), () => true);
    expect((found ?? []).map((f) => f.path).sort()).toEqual(['package.json', 'src/real.ts']);
  });

  it('listShallow skips symlinks and excluded dirs, marks directories with a trailing slash', async () => {
    // Catches: link names or node_modules in the prompt tree.
    await mkdir(join(root, 'node_modules'), { recursive: true });
    const tree = await fsrc.listShallow(root, 2, 50, new Set(['node_modules']));
    expect(tree).toEqual(['package.json', 'src/', 'src/real.ts']);
  });
});
