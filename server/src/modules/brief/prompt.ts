import type { BlastRadius, ChatMessage, Intent } from '@devdigest/shared';
import { estimateTokens, wrapUntrusted } from '@devdigest/reviewer-core';
import { loadPromptTemplate } from '../../platform/prompts.js';
import {
  BLAST_MAX_TOKENS,
  BLAST_UNAVAILABLE,
  DESCRIPTION_MAX_TOKENS,
  FILES_MAX_TOKENS,
  FINDINGS_MAX_TOKENS,
  FINDING_TITLE_MAX_CHARS,
  INPUT_TARGET_TOKENS,
  INTENT_MAX_TOKENS,
  INTENT_UNAVAILABLE,
  MAX_FINDINGS_SENT,
  MAX_HUNKS_PER_FILE_SENT,
  NONE,
  TITLE_MAX_TOKENS,
} from './constants.js';
import { capTextToTokens, fitLines, type PreparedFile } from './helpers.js';
import type { BriefFinding } from './ports.js';

export interface BriefFacts {
  title: string;
  body: string | null;
  intent: Intent | null;
  blast: BlastRadius | null;
  /** Files already selected (role order, <= MAX_FILES_SENT). */
  files: PreparedFile[];
  filesTotal: number;
  findings: BriefFinding[];
}

/** The non-document part of the prompt, kept in pieces so the final guard can trim it. */
export interface FactBlocks {
  system: string;
  /** pr-title, pr-description, intent, blast (already wrapped and capped). */
  fixed: string[];
  fileLines: string[];
  filesTotal: number;
  findingLines: string[];
  /** Estimated tokens of the system prompt and every non-document block. */
  restTokens: number;
  filesSent: number;
}

export interface AssembledBrief {
  messages: ChatMessage[];
  estimatedTokens: number;
  budgetTrimmed: boolean;
  docsSent: string[];
  filesSent: number;
}

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/** Tokens the `wrapUntrusted` delimiters of `tag` add around any content. */
const wrapOverhead = (tag: string): number => estimateTokens(wrapUntrusted(tag, ''));

export function loadBriefSystemPrompt(): Promise<string> {
  return loadPromptTemplate('brief.system.md');
}

function renderIntent(intent: Intent, inScope: string[], outScope: string[]): string {
  const parts = [`intent: ${intent.intent}`];
  if (inScope.length > 0) parts.push('in scope:', ...inScope.map((s) => `- ${s}`));
  if (outScope.length > 0) parts.push('out of scope:', ...outScope.map((s) => `- ${s}`));
  return parts.join('\n');
}

function intentBlock(intent: Intent | null): string {
  if (!intent) return wrapUntrusted('intent', INTENT_UNAVAILABLE);
  const cap = INTENT_MAX_TOKENS - wrapOverhead('intent');
  const inScope = [...intent.in_scope];
  const outScope = [...intent.out_of_scope];
  let text = renderIntent(intent, inScope, outScope);
  // Out-of-scope items go first, then in-scope, then the sentence itself is cut.
  while (estimateTokens(text) > cap && outScope.length > 0) {
    outScope.pop();
    text = renderIntent(intent, inScope, outScope);
  }
  while (estimateTokens(text) > cap && inScope.length > 0) {
    inScope.pop();
    text = renderIntent(intent, inScope, outScope);
  }
  return wrapUntrusted('intent', capTextToTokens(text, cap));
}

function blastBlock(blast: BlastRadius | null): string {
  if (!blast) return wrapUntrusted('blast', BLAST_UNAVAILABLE);
  const cap = BLAST_MAX_TOKENS - wrapOverhead('blast');
  const summary = `summary: ${blast.summary}`;
  const callers = blast.downstream.flatMap((d) =>
    d.callers.map((c) => `${c.file}:${c.line} | ${c.name} -> ${d.symbol}`),
  );
  const { kept } = fitLines(callers, cap, [summary]);
  return wrapUntrusted('blast', capTextToTokens([summary, ...kept].join('\n'), cap));
}

function fileLine(f: PreparedFile): string {
  const shown = f.ranges.slice(0, MAX_HUNKS_PER_FILE_SENT).map(([s, e]) => `${s}-${e}`);
  const more = f.ranges.length - shown.length;
  if (more > 0) shown.push(`+${more} more`);
  const hunks = shown.length > 0 ? shown.join(', ') : NONE;
  return `${f.path} | +${f.additions} -${f.deletions} | ${f.role} | hunks: ${hunks}`;
}

const totalsLine = (listed: number, total: number): string => `files listed ${listed} of ${total}`;

function findingLines(findings: BriefFinding[]): string[] {
  return [...findings]
    .sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3) ||
        a.file.localeCompare(b.file) ||
        a.line - b.line,
    )
    .slice(0, MAX_FINDINGS_SENT)
    .map((f) => `${f.file}:${f.line} | ${f.severity} | ${f.title.slice(0, FINDING_TITLE_MAX_CHARS)}`);
}

function filesBlock(lines: string[], total: number): string {
  return wrapUntrusted('changed-files', [...lines, totalsLine(lines.length, total)].join('\n'));
}

function findingsBlock(lines: string[]): string {
  return wrapUntrusted('review-findings', lines.length > 0 ? lines.join('\n') : NONE);
}

/**
 * Applies every non-document cap (section 4.8) and returns the pieces plus the
 * measured `restTokens` the service uses to size the spec documents.
 */
export function buildFactBlocks(facts: BriefFacts, system: string): FactBlocks {
  const title = wrapUntrusted(
    'pr-title',
    capTextToTokens(facts.title, TITLE_MAX_TOKENS - wrapOverhead('pr-title')),
  );
  const body = facts.body?.trim() ? facts.body : NONE;
  const description = wrapUntrusted(
    'pr-description',
    capTextToTokens(body, DESCRIPTION_MAX_TOKENS - wrapOverhead('pr-description')),
  );
  const fixed = [title, description, intentBlock(facts.intent), blastBlock(facts.blast)];

  // The totals line is always kept; size it for its largest form.
  const totals = totalsLine(facts.filesTotal, facts.filesTotal);
  const fitted = fitLines(
    facts.files.map(fileLine),
    FILES_MAX_TOKENS - wrapOverhead('changed-files'),
    [totals],
  );
  const fitFindings = fitLines(
    findingLines(facts.findings),
    FINDINGS_MAX_TOKENS - wrapOverhead('review-findings'),
  );

  const blocks: FactBlocks = {
    system,
    fixed,
    fileLines: fitted.kept,
    filesTotal: facts.filesTotal,
    findingLines: fitFindings.kept,
    restTokens: 0,
    filesSent: fitted.kept.length,
  };
  blocks.restTokens = estimateTokens(system) + estimateTokens(renderUser(blocks, []));
  return blocks;
}

function renderUser(b: FactBlocks, docs: { path: string; content: string }[]): string {
  return [
    ...b.fixed,
    filesBlock(b.fileLines, b.filesTotal),
    findingsBlock(b.findingLines),
    ...docs.map((d) => wrapUntrusted(`spec-doc:${d.path}`, d.content)),
  ].join('\n\n');
}

/**
 * Adds the spec documents and runs the final guard: if the estimate is still
 * above the target, drop whole documents, then file lines, then finding lines
 * (all from the end).
 */
export function assembleBriefMessages(
  blocks: FactBlocks,
  docsIn: { path: string; content: string }[],
): AssembledBrief {
  const docs = [...docsIn];
  const fileLines = [...blocks.fileLines];
  const findingLinesLeft = [...blocks.findingLines];
  const total = (): number =>
    estimateTokens(blocks.system) +
    estimateTokens(renderUser({ ...blocks, fileLines, findingLines: findingLinesLeft }, docs));

  let trimmed = false;
  while (total() > INPUT_TARGET_TOKENS) {
    if (docs.length > 0) docs.pop();
    else if (fileLines.length > 0) fileLines.pop();
    else if (findingLinesLeft.length > 0) findingLinesLeft.pop();
    else break;
    trimmed = true;
  }

  const user = renderUser({ ...blocks, fileLines, findingLines: findingLinesLeft }, docs);
  return {
    messages: [
      { role: 'system', content: blocks.system },
      { role: 'user', content: user },
    ],
    estimatedTokens: estimateTokens(blocks.system) + estimateTokens(user),
    budgetTrimmed: trimmed,
    docsSent: docs.map((d) => d.path),
    filesSent: fileLines.length,
  };
}
