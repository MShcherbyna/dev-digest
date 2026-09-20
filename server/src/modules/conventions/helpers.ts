import { isAbsolute, normalize } from 'node:path';
import type { ConventionRow } from './repository.js';
import type { ConventionDto } from './schemas.js';
import { LINE_TOLERANCE, MAX_CHARS_PER_FILE, SKILL_BODY_TITLE, SNIPPET_LINES } from './constants.js';

export interface VerifiedEvidence {
  line: number;
  snippet: string;
}

/** Prefix every line with its 1-based number so the model can cite exact lines. */
export function numberLines(content: string, maxChars = MAX_CHARS_PER_FILE): string {
  const out: string[] = [];
  let used = 0;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const row = `${i + 1}: ${lines[i]}`;
    used += row.length + 1;
    if (used > maxChars) {
      out.push('... (truncated)');
      break;
    }
    out.push(row);
  }
  return out.join('\n');
}

/** Repo-relative, no traversal — evidence paths come from the model and are untrusted. */
export function isSafeRelativePath(path: string): boolean {
  if (!path || isAbsolute(path) || path.includes('\0')) return false;
  const n = normalize(path);
  return !n.startsWith('..') && !n.split('/').includes('..');
}

/**
 * Check a model-cited evidence against the real file. Passes when the cited
 * line exists and is non-empty and — if the model quoted code — that quote's
 * first line appears within LINE_TOLERANCE lines of it. When the quote sits
 * elsewhere in the file the line is corrected to where it really is. Returns
 * null when the evidence can't be confirmed (candidate is dropped).
 */
export function verifyEvidence(
  content: string,
  line: number,
  code?: string,
): VerifiedEvidence | null {
  const lines = content.split('\n');
  if (line < 1 || line > lines.length) return null;

  const needle = code?.split('\n').find((l) => l.trim() !== '')?.trim();
  let resolved = line;
  if (needle) {
    const near = findNear(lines, line, needle);
    if (near !== null) resolved = near;
    else {
      const anywhere = lines.findIndex((l) => l.includes(needle));
      if (anywhere === -1) return null;
      resolved = anywhere + 1;
    }
  }
  if ((lines[resolved - 1] ?? '').trim() === '') return null;
  return { line: resolved, snippet: snippetAt(lines, resolved) };
}

function findNear(lines: string[], line: number, needle: string): number | null {
  for (let d = 0; d <= LINE_TOLERANCE; d++) {
    for (const idx of d === 0 ? [line] : [line - d, line + d]) {
      if (idx >= 1 && idx <= lines.length && lines[idx - 1]!.includes(needle)) return idx;
    }
  }
  return null;
}

function snippetAt(lines: string[], line: number): string {
  return lines
    .slice(line - 1, line - 1 + SNIPPET_LINES)
    .join('\n')
    .trimEnd();
}

export const ruleKey = (rule: string, path: string | null | undefined): string =>
  `${rule.trim().toLowerCase()}::${path ?? ''}`;

export function toConventionDto(row: ConventionRow): ConventionDto {
  return {
    id: row.id,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    evidence_line: row.evidenceLine,
    confidence: row.confidence ?? 0,
    accepted: row.accepted,
  };
}

export function defaultSkillMeta(repoFullName: string, count: number) {
  const short = repoFullName.split('/').pop() ?? repoFullName;
  return {
    name: `${short}-conventions`,
    description: `${count} house conventions extracted from ${short}`,
  };
}

/** Flat markdown list of accepted conventions with their evidence. */
export function buildSkillBody(rows: ConventionRow[]): string {
  const items = rows.map((r) => {
    const ref = r.evidencePath ? `${r.evidencePath}${r.evidenceLine ? `#L${r.evidenceLine}` : ''}` : '';
    return `- ${r.rule}${ref ? `\n  - evidence: \`${ref}\`` : ''}`;
  });
  return `${SKILL_BODY_TITLE}\n\nFollow these conventions when writing or reviewing code in this repository.\n\n${items.join('\n')}\n`;
}
