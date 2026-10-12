/** Pure grounding / validation rules of the onboarding module. No I/O. */
import {
  DIAGRAM_MAX_EDGES,
  DIAGRAM_MAX_NODES,
  MAX_CRITICAL_PATHS,
  MAX_FIRST_TASKS,
  MAX_READING_PATH,
  MAX_REL_PATH_CHARS,
  NODE_KINDS,
} from './constants.js';
import type { FsKind, IndexSnapshot } from './ports.js';
import type { Complexity, Diagram, IndexStatus, NodeKind, OnboardingTour, PathKind } from './schemas.js';

/** Resolves what a (validated, normalised) clone-relative path is. */
export type KindOf = (relPath: string) => Promise<FsKind>;

/**
 * Normalised relative path, or null when the model's path is unsafe: empty,
 * absolute, drive letter, control chars, `.`/`..`/empty segments, too long.
 * One trailing `/` is allowed and stripped.
 */
export function validateRelPath(p: string): string | null {
  if (typeof p !== 'string' || p.trim() === '') return null;
  if (p.length > MAX_REL_PATH_CHARS) return null;
  if (p.startsWith('/') || p.startsWith('\\') || /^[A-Za-z]:/.test(p)) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(p)) return null;
  const stripped = p.endsWith('/') ? p.slice(0, -1) : p;
  if (stripped === '') return null;
  const segs = stripped.split('/');
  if (segs.some((s) => s === '' || s === '.' || s === '..')) return null;
  return stripped;
}

export function capList<T>(items: T[], max: number): T[] {
  return items.slice(0, max);
}

export interface GroundedList<T> {
  kept: T[];
  droppedInvalid: number;
  droppedOverflow: number;
}

async function groundFiles<T extends { path: string }>(
  items: T[],
  kindOf: KindOf,
  max: number,
): Promise<GroundedList<T>> {
  const ok: T[] = [];
  let droppedInvalid = 0;
  for (const item of items) {
    const rel = validateRelPath(item.path);
    if (rel !== null && (await kindOf(rel)) === 'file') ok.push(item);
    else droppedInvalid++;
  }
  const kept = capList(ok, max);
  return { kept, droppedInvalid, droppedOverflow: ok.length - kept.length };
}

export function groundCriticalPaths<T extends { path: string }>(items: T[], kindOf: KindOf) {
  return groundFiles(items, kindOf, MAX_CRITICAL_PATHS);
}

export function groundReadingPath<T extends { path: string }>(items: T[], kindOf: KindOf) {
  return groundFiles(items, kindOf, MAX_READING_PATH);
}

export interface FirstTaskIn {
  title: string;
  path: string;
  complexity: Complexity;
}
export interface FirstTaskOut extends FirstTaskIn {
  path_kind: PathKind;
}

/** Parent directory of a normalised path; `''` for a root-level entry. */
function parentOf(rel: string): string {
  const i = rel.lastIndexOf('/');
  return i === -1 ? '' : rel.slice(0, i);
}

/**
 * First tasks (AC-8): an existing file, an existing directory, or a new file
 * whose parent directory exists (the clone root counts as one). Else dropped.
 */
export async function groundFirstTasks(
  items: FirstTaskIn[],
  kindOf: KindOf,
): Promise<GroundedList<FirstTaskOut>> {
  const ok: FirstTaskOut[] = [];
  let droppedInvalid = 0;
  for (const item of items) {
    const rel = validateRelPath(item.path);
    if (rel === null) {
      droppedInvalid++;
      continue;
    }
    const kind = await kindOf(rel);
    if (kind === 'file') ok.push({ ...item, path_kind: 'file' });
    else if (kind === 'directory') ok.push({ ...item, path_kind: 'directory' });
    else if (kind === 'missing') {
      const parent = parentOf(rel);
      if (parent === '' || (await kindOf(parent)) === 'directory') {
        ok.push({ ...item, path_kind: 'new_file' });
      } else droppedInvalid++;
    } else droppedInvalid++;
  }
  const kept = capList(ok, MAX_FIRST_TASKS);
  return { kept, droppedInvalid, droppedOverflow: ok.length - kept.length };
}

/**
 * Diagram hygiene (AC-12, AC-29). Exact duplicate edges are removed silently;
 * anything else wrong makes the whole graph invalid (null, prose is kept).
 */
export function validateDiagram(
  nodes: { id: string; label: string; kind: string }[],
  edges: { from: string; to: string }[],
): Diagram | null {
  if (nodes.length === 0 || nodes.length > DIAGRAM_MAX_NODES) return null;
  const ids = new Set<string>();
  for (const n of nodes) {
    if (n.id.trim() === '' || n.label.trim() === '') return null;
    if (!NODE_KINDS.includes(n.kind)) return null;
    if (ids.has(n.id)) return null;
    ids.add(n.id);
  }
  const seen = new Set<string>();
  const outEdges: { from: string; to: string }[] = [];
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) return null;
    if (e.from === e.to) return null;
    const key = JSON.stringify([e.from, e.to]);
    if (seen.has(key)) continue;
    seen.add(key);
    outEdges.push({ from: e.from, to: e.to });
  }
  if (outEdges.length > DIAGRAM_MAX_EDGES) return null;
  return {
    nodes: nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind as NodeKind })),
    edges: outEdges,
  };
}

/** Inline-code spans in prose that look like paths (AC-33). Fenced blocks are ignored. */
export function extractProsePaths(markdown: string): string[] {
  const text = markdown.replace(/```[\s\S]*?```/g, '');
  const out = new Set<string>();
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    let c = (m[1] ?? '').trim();
    if (c === '' || /\s/.test(c) || c.includes('://')) continue;
    c = c.replace(/\/\*\*$/, '').replace(/\/\*$/, '').replace(/\/$/, '');
    if (c === '') continue;
    if (c.includes('/') || /\.[A-Za-z0-9]{1,6}$/.test(c)) out.add(c);
  }
  return [...out];
}

/** Counts prose paths that are unsafe or not an existing file/directory. Prose is never changed. */
export async function countUnverifiedProsePaths(paths: string[], kindOf: KindOf): Promise<number> {
  let n = 0;
  for (const p of paths) {
    const rel = validateRelPath(p);
    if (rel === null) {
      n++;
      continue;
    }
    const kind = await kindOf(rel);
    if (kind !== 'file' && kind !== 'directory') n++;
  }
  return n;
}

/** `getIndexState` synthesises a degraded/no_data row for a never-indexed repo; map it to `none`. */
export function toIndexSummary(state: IndexSnapshot): {
  status: IndexStatus;
  last_indexed_sha: string | null;
  files_indexed: number;
} {
  const none =
    state.lastIndexedSha === '' ||
    (state.degradedReason === 'no_data' && state.updatedAt.getTime() === 0);
  if (none) return { status: 'none', last_indexed_sha: null, files_indexed: 0 };
  return {
    status: state.status,
    last_indexed_sha: state.lastIndexedSha,
    files_indexed: state.filesIndexed,
  };
}

/** Stale = a tour exists, the repo has been indexed, and the indexed commit differs from the tour's. */
export function isStale(tour: OnboardingTour | null, lastIndexedSha: string | null): boolean {
  return tour !== null && lastIndexedSha !== null && lastIndexedSha !== tour.commit_sha;
}
