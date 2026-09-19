import { SkillType } from '@devdigest/shared';
import type { Skill, SkillImportPreview, SkillVersion } from '@devdigest/shared';
import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from './constants.js';
import type { SkillRow, SkillVersionRow } from './repository.js';

/**
 * Pure helpers for the skills module — row ⇄ DTO mapping, token estimate, the
 * .md import parser and the prompt-block matcher. No I/O and nothing here ever
 * executes or fetches imported content: it is only parsed as text.
 */

/** Rough token estimate used across the skills UI and traces: ceil(chars / 4). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    source: row.source,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/** Percentage rounded to one decimal, or null when the denominator is 0. */
export function pct(part: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when a run's assembled skills text contains this skill's `### <name>`
 * block header (whole-line match, so `### foo` does not match `### foobar`).
 */
export function includesSkillBlock(skillsText: string | null | undefined, name: string): boolean {
  if (!skillsText) return false;
  return new RegExp(`(^|\\n)### ${escapeRegExp(name)}[ \\t]*(\\r?\\n|$)`).test(skillsText);
}

const FRONT_MATTER = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Parse `key: value` lines of a YAML-ish front-matter block (flat keys only). */
function parseFrontMatter(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2]!.trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]!.toLowerCase()] = value;
  }
  return out;
}

function firstHeading(body: string): string | undefined {
  const m = /^#\s+(.+?)\s*#*\s*$/m.exec(body);
  return m?.[1]?.trim() || undefined;
}

/** First non-heading, non-fence paragraph, whitespace-collapsed. */
function firstParagraph(body: string): string | undefined {
  let inFence = false;
  const para: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      if (para.length) break;
      continue;
    }
    if (inFence) continue;
    if (line.trim() === '') {
      if (para.length) break;
      continue;
    }
    if (/^\s*#{1,6}\s/.test(line)) {
      if (para.length) break;
      continue;
    }
    para.push(line.trim());
  }
  return para.length ? para.join(' ') : undefined;
}

const SHELL_FENCE = /```[ \t]*(?:sh|bash|shell|zsh|console|powershell|ps1)\b/i;
const SHELL_COMMAND =
  /\b(?:curl|wget)\b[^\n]*(?:https?:|\||\s-[a-zA-Z])|\|\s*(?:ba|z)?sh\b|\bsudo\b|\brm\s+-rf?\b/i;
const URL_RE = /https?:\/\/[^\s)>\]"']+/i;

/** Safety warnings for imported text; the content is never run, only shown to the model. */
function contentWarnings(body: string): string[] {
  const warnings: string[] = [];
  const fences = body.match(/```[\s\S]*?```/g) ?? [];
  const shellish = SHELL_FENCE.test(body) || fences.some((f) => SHELL_COMMAND.test(f));
  if (shellish) {
    warnings.push(
      'Contains shell/curl-like code blocks. Nothing is executed, but this text will be shown to the model.',
    );
  }
  if (URL_RE.test(body)) {
    warnings.push('Contains URLs. They are not fetched, but they will be shown to the model.');
  }
  return warnings;
}

function nameFromFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  return base.replace(/\.(md|markdown|txt)$/i, '').trim();
}

/**
 * Turn a client-supplied .md file into a preview: optional front-matter
 * (`name`, `description`, `type`), falling back to the first `# heading`, the
 * first paragraph and `custom`. Pure — persists and executes nothing.
 */
export function parseSkillImport(filename: string, content: string): SkillImportPreview {
  const warnings: string[] = [];
  const fm = FRONT_MATTER.exec(content);
  const meta = fm ? parseFrontMatter(fm[1]!) : {};
  const body = (fm ? content.slice(fm[0].length) : content).trim();

  const name = (
    meta.name ||
    firstHeading(body) ||
    nameFromFilename(filename) ||
    'Imported skill'
  ).slice(0, MAX_NAME_LENGTH);
  const description = (meta.description || firstParagraph(body) || '').slice(
    0,
    MAX_DESCRIPTION_LENGTH,
  );

  let type: SkillType = 'custom';
  if (meta.type !== undefined) {
    const parsed = SkillType.safeParse(meta.type.toLowerCase());
    if (parsed.success) type = parsed.data;
    else warnings.push(`Unknown type "${meta.type}"; using "custom".`);
  }

  if (body.length === 0) warnings.push('The file has no body after front-matter.');
  warnings.push(...contentWarnings(body));

  return { name, description, type, body, tokens: estimateTokens(body), warnings };
}
