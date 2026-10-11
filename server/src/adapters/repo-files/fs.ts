import { lstat, readdir, realpath, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import type { Dirent } from 'node:fs';
import { FsRepoDocsSource } from '../repo-docs/fs.js';
import type { FileRead, FsKind, RepoFile, RepoFiles } from '../../modules/onboarding/ports.js';

/** Adapter-local copy of the module's path guard (an adapter never imports module helpers). */
function isSafeRel(p: string): string | null {
  if (p.trim() === '' || p.length > 1024) return null;
  if (p.startsWith('/') || p.startsWith('\\') || /^[A-Za-z]:/.test(p)) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(p)) return null;
  const s = p.endsWith('/') ? p.slice(0, -1) : p;
  if (s === '') return null;
  if (s.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) return null;
  return s;
}

/**
 * Node-fs RepoFiles. Fails CLOSED like FsRepoDocsSource (which it composes for
 * walk/read): symlinks are never followed, every path segment is lstat-checked,
 * any realpath error is a refusal.
 */
export class FsRepoFiles implements RepoFiles {
  private docs = new FsRepoDocsSource();

  async isDirectory(root: string): Promise<boolean> {
    try {
      return (await stat(root)).isDirectory();
    } catch {
      return false;
    }
  }

  async kind(root: string, relPath: string): Promise<FsKind> {
    const rel = isSafeRel(relPath);
    if (rel === null) return 'invalid';
    let realRoot: string;
    try {
      realRoot = await realpath(root);
    } catch {
      return 'invalid';
    }
    let cur = realRoot;
    let st;
    for (const seg of rel.split('/')) {
      cur = join(cur, seg);
      try {
        st = await lstat(cur);
      } catch (err) {
        return (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'invalid';
      }
      if (st.isSymbolicLink()) return 'invalid';
    }
    if (cur !== realRoot && !cur.startsWith(realRoot + sep)) return 'invalid';
    if (!st) return 'invalid';
    if (st.isFile()) return 'file';
    if (st.isDirectory()) return 'directory';
    return 'invalid';
  }

  walk(
    root: string,
    excluded: ReadonlySet<string>,
    accept: (relPath: string) => boolean,
  ): Promise<RepoFile[] | null> {
    return this.docs.walk(root, excluded, accept);
  }

  read(root: string, relPath: string, maxBytes: number): Promise<FileRead> {
    return this.docs.read(root, relPath, maxBytes);
  }

  async listShallow(
    root: string,
    depth: number,
    max: number,
    excluded: ReadonlySet<string>,
  ): Promise<string[]> {
    const out: string[] = [];
    const queue: { dir: string; rel: string; d: number }[] = [{ dir: root, rel: '', d: 1 }];
    while (queue.length > 0 && out.length < max) {
      const { dir, rel, d } = queue.shift()!;
      let entries: Dirent[];
      try {
        entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
      } catch {
        continue;
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const e of entries) {
        if (out.length >= max) break;
        if (e.isSymbolicLink()) continue;
        const childRel = rel === '' ? e.name : `${rel}/${e.name}`;
        if (e.isDirectory()) {
          if (excluded.has(e.name)) continue;
          out.push(`${childRel}/`);
          if (d < depth) queue.push({ dir: join(dir, e.name), rel: childRel, d: d + 1 });
        } else if (e.isFile()) {
          out.push(childRel);
        }
      }
    }
    return out.sort();
  }
}
