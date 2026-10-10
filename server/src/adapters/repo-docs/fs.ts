import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { Dirent } from 'node:fs';
import type { DocFile, DocRead, RepoDocsSource } from '../../modules/project-context/ports.js';

/**
 * Node-fs RepoDocsSource. Fails CLOSED: symlinks are never followed or listed,
 * every realpath error is a refusal (unlike SimpleGitClient.readFile, which
 * falls through), size is checked before reading, UTF-8 is strict.
 */
export class FsRepoDocsSource implements RepoDocsSource {
  async walk(
    root: string,
    excluded: ReadonlySet<string>,
    accept: (relPath: string) => boolean,
  ): Promise<DocFile[] | null> {
    try {
      if (!(await stat(root)).isDirectory()) return null;
    } catch {
      return null;
    }
    const out: DocFile[] = [];
    await this.walkDir(root, root, excluded, accept, out);
    return out;
  }

  private async walkDir(
    root: string,
    dir: string,
    excluded: ReadonlySet<string>,
    accept: (relPath: string) => boolean,
    out: DocFile[],
  ): Promise<void> {
    let entries: Dirent[];
    try {
      entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
    } catch {
      return; // unreadable directory: skip
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (excluded.has(entry.name)) continue;
        await this.walkDir(root, full, excluded, accept, out);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = relative(root, full).split(sep).join('/');
      if (!accept(rel)) continue;
      try {
        out.push({ path: rel, size: (await stat(full)).size });
      } catch {
        continue;
      }
    }
  }

  async read(root: string, relPath: string, maxBytes: number): Promise<DocRead> {
    let realRoot: string;
    try {
      realRoot = await realpath(root);
    } catch {
      return { kind: 'missing' };
    }
    // Walk the path segment by segment: a symlink anywhere in the chain is refused
    // (outside the clone → invalid_path, inside → not a regular file → unreadable).
    let cur = realRoot;
    for (const seg of relPath.split('/')) {
      cur = join(cur, seg);
      let st;
      try {
        st = await lstat(cur);
      } catch (err) {
        return { kind: (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unreadable' };
      }
      if (st.isSymbolicLink()) {
        try {
          const target = await realpath(cur);
          if (target !== realRoot && !target.startsWith(realRoot + sep)) return { kind: 'invalid_path' };
        } catch {
          return { kind: 'unreadable' };
        }
        return { kind: 'unreadable' };
      }
    }
    if (cur !== realRoot && !cur.startsWith(realRoot + sep)) return { kind: 'invalid_path' };
    try {
      const st = await lstat(cur);
      if (!st.isFile()) return { kind: 'unreadable' };
      if (st.size > maxBytes) return { kind: 'too_large' };
      const buf = await readFile(cur);
      if (buf.length > maxBytes) return { kind: 'too_large' };
      return { kind: 'ok', content: new TextDecoder('utf-8', { fatal: true }).decode(buf) };
    } catch {
      return { kind: 'unreadable' };
    }
  }
}
