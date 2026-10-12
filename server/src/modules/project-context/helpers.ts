import { estimateTokens } from '@devdigest/reviewer-core';
import { DOC_TYPES, MAX_DISCOVERED, type DocType } from './constants.js';

/** Type = deepest directory segment named specs|docs|insights (AC-5). */
export function docTypeOf(path: string): DocType {
  const dirs = path.split('/').slice(0, -1);
  for (let i = dirs.length - 1; i >= 0; i--) {
    const seg = dirs[i]!;
    if ((DOC_TYPES as readonly string[]).includes(seg)) return seg as DocType;
  }
  // Unreachable for the default glob; a custom glob can match elsewhere.
  return 'docs';
}

/** `ceil(chars/4)` of content, or `ceil(size/4)` when the content was not read. */
export function tokensFor(size: number, content?: string): number {
  return content !== undefined ? estimateTokens(content) : Math.ceil(size / 4);
}

/** Sort by plain code-unit comparison, keep the first MAX_DISCOVERED (AC-36). */
export function capAndSort<T extends { path: string }>(
  files: T[],
  max = MAX_DISCOVERED,
): { files: T[]; truncated: boolean; total: number } {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files: sorted.slice(0, max), truncated: sorted.length > max, total: sorted.length };
}

export interface MergedAttachment {
  path: string;
  origin: 'agent' | 'skill';
  skill?: string;
}

/** Agent paths first, then each skill's, de-duplicated keeping the first (AC-24). */
export function mergeAttachments(
  agentPaths: string[],
  skills: { name: string; paths: string[] }[],
): MergedAttachment[] {
  const seen = new Set<string>();
  const out: MergedAttachment[] = [];
  for (const path of agentPaths) {
    if (seen.has(path)) continue;
    seen.add(path);
    out.push({ path, origin: 'agent' });
  }
  for (const s of skills) {
    for (const path of s.paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({ path, origin: 'skill', skill: s.name });
    }
  }
  return out;
}

/** Distinct agents per path (AC-9). Rows: one per agent, with direct or skill-inherited paths. */
export function countUsedBy(rows: { agentId: string; paths: string[] }[]): Map<string, number> {
  const agentsByPath = new Map<string, Set<string>>();
  for (const r of rows) {
    for (const p of r.paths) {
      let set = agentsByPath.get(p);
      if (!set) agentsByPath.set(p, (set = new Set()));
      set.add(r.agentId);
    }
  }
  return new Map([...agentsByPath].map(([p, s]) => [p, s.size]));
}

/** Duplicates in a list (for the 400 details). */
export function duplicatesOf(paths: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const p of paths) (seen.has(p) ? dup : seen).add(p);
  return [...dup];
}

/** Does any path segment (dirs) sit under an excluded directory? */
export function underExcludedDir(path: string, excluded: ReadonlySet<string>): boolean {
  return path.split('/').slice(0, -1).some((seg) => excluded.has(seg));
}
