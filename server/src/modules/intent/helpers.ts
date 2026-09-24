/**
 * Pure helpers for the intent module (no DB / network / `this`).
 */
import { createHash } from 'node:crypto';
import { isAbsolute, normalize } from 'node:path';
import { DOC_EXTENSIONS, MAX_EXTERNAL_LINKS, MIN_DOC_CHARS } from './constants.js';
import type {
  Confidence,
  GatheredSources,
  IntentRecord,
  IntentRepoRef,
  PrIntent,
} from './ports.js';
import type { PrIntentDto } from './schemas.js';

const EXT_RE = DOC_EXTENSIONS.join('|');

/** Issue numbers referenced with a closing keyword ("Closes #12"), in order, deduped. */
export function extractIssueRefs(text: string): number[] {
  const out: number[] = [];
  const re = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)\b/gi;
  for (const m of text.matchAll(re)) {
    const n = Number(m[1]);
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * A doc path we are willing to read from the local clone: relative, inside the
 * repo (no `..`, no NUL / backslash) and carrying an allowed doc extension.
 * Model- and author-controlled text reaches this, so it is checked before any read.
 */
export function isSafeDocPath(path: string): boolean {
  if (!path || path.includes('\0') || path.includes('\\') || isAbsolute(path)) return false;
  // Conservative charset: blocks markup / control chars (e.g. `</untrusted>`, newlines) in paths.
  if (!/^[\w@.\-/ +]+$/.test(path)) return false;
  const n = normalize(path);
  if (n.startsWith('..') || n.split('/').includes('..')) return false;
  const ext = n.split('.').pop()?.toLowerCase() ?? '';
  return (DOC_EXTENSIONS as readonly string[]).includes(ext);
}

export interface DocLinks {
  /** Same-repo doc paths (validated), first-seen order. */
  docs: string[];
  /** Foreign URLs: recorded as `unfetched`, never fetched (SSRF). */
  external: string[];
}

/**
 * Find linked plan/spec docs in free text: same-repo GitHub blob URLs and
 * repo-relative paths ending in a doc extension. Other repos / hosts are
 * only reported, never resolved.
 */
export function extractDocLinks(text: string, repo: IntentRepoRef): DocLinks {
  const docs: string[] = [];
  const external: string[] = [];
  const addDoc = (raw: string) => {
    const path = raw.replace(/^\.\//, '').replace(/^\/+/, '');
    if (isSafeDocPath(path) && !docs.includes(path)) docs.push(path);
  };

  const rest = text.replace(/https?:\/\/[^\s)>\]"'`]+/g, (raw) => {
    const url = raw.replace(/[.,;:]+$/, '');
    const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/[^/]+\/([^?#]+)/i);
    if (
      m &&
      m[1]!.toLowerCase() === repo.owner.toLowerCase() &&
      m[2]!.toLowerCase() === repo.name.toLowerCase()
    ) {
      try {
        addDoc(decodeURIComponent(m[3]!));
      } catch {
        /* malformed escape — ignore */
      }
    } else if (!external.includes(url) && external.length < MAX_EXTERNAL_LINKS) {
      external.push(url);
    }
    return ' ';
  });

  const relative = new RegExp(
    `(?:^|[\\s(\\[\`"'])((?:\\.{1,2}/|/)?(?:[\\w@.\\-]+/)*[\\w@.\\-]+\\.(?:${EXT_RE}))(?=$|[\\s)\\]\`"',.;:])`,
    'gim',
  );
  for (const m of rest.matchAll(relative)) addDoc(m[1]!);

  return { docs, external };
}

/** The new-side text of a unified-diff patch (context + added lines, prefixes stripped). */
export function docFromPatch(patch: string): string {
  const out: string[] = [];
  for (const line of patch.split('\n')) {
    if (line.startsWith('@@') || line.startsWith('\\') || line.startsWith('-')) continue;
    out.push(line.startsWith('+') || line.startsWith(' ') ? line.slice(1) : line);
  }
  return out.join('\n');
}

/** Body without template noise (HTML comments, markdown headings, checklists) — for the "is it documented" test. */
export function stripTemplate(body: string): string {
  return body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .split('\n')
    .filter((l) => !/^\s*#{1,6}\s/.test(l) && !/^\s*[-*]\s*\[[ xX]\]/.test(l))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text: string, max: number): { text: string; truncated: boolean } {
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false };
}

export function firstLine(text: string): string {
  return text.split('\n')[0]?.trim() ?? '';
}

/** Stable hash of everything the classifier reads; equal hash ⇒ a regenerate would be a no-op. */
export function inputHash(s: GatheredSources): string {
  const norm = (t: string) => t.replace(/\r\n/g, '\n').trim();
  const payload = {
    title: norm(s.title),
    body: norm(s.body),
    issue: s.issue ? { n: s.issue.number, title: norm(s.issue.title), body: norm(s.issue.body) } : null,
    docs: s.docs.map((d) => ({ path: d.path, content: norm(d.content) })),
    branch: s.branch,
    commits: s.commits.map(norm),
    paths: [...s.paths].sort(),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

/**
 * Highest confidence the evidence can justify — computed by code, never by the
 * model. high: substantive description AND an issue/doc; medium: one of them;
 * low: indirect signals only. A doc/link that failed or wasn't fetched caps at medium.
 */
export function evidenceCap(s: GatheredSources): Confidence {
  const documented = stripTemplate(s.body).length >= MIN_DOC_CHARS;
  const referenced = s.issue !== null || s.docs.length > 0;
  let cap: Confidence = documented && referenced ? 'high' : documented || referenced ? 'medium' : 'low';
  const gap = s.refs.some(
    (r) => (r.kind === 'doc' || r.kind === 'link') && (r.status === 'failed' || r.status === 'unfetched'),
  );
  if (gap && cap === 'high') cap = 'medium';
  return cap;
}

/** min(model's claim, evidence cap). */
export function finalConfidence(model: Confidence, cap: Confidence): Confidence {
  return RANK[model] <= RANK[cap] ? model : cap;
}

/** Stale when the PR head moved since derivation, or the row predates input hashing. */
export function isStale(record: Pick<IntentRecord, 'headSha' | 'inputHash'>, headSha: string): boolean {
  return record.headSha !== headSha || record.inputHash == null;
}

export function toPromptIntent(i: PrIntent) {
  return {
    summary: i.intent,
    inScope: i.inScope,
    outOfScope: i.outOfScope,
    riskAreas: i.riskAreas,
    confidence: i.confidence,
  };
}

export function toDto(i: PrIntent): PrIntentDto {
  return {
    pr_id: i.prId,
    intent: i.intent,
    in_scope: i.inScope,
    out_of_scope: i.outOfScope,
    risk_areas: i.riskAreas,
    confidence: i.confidence,
    sources: i.sources,
    head_sha: i.headSha,
    derived_at: i.derivedAt.toISOString(),
    model: i.model,
    stale: i.stale,
  };
}
