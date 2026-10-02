import type { FindingRecord, ReviewRecord, RunRecord } from '../gateway/ports.js';
import { decodeCursor, MAX_RESPONSE_CHARS, paginate } from '../lib/paginate.js';
import { BusinessError } from '../lib/result.js';
import { sanitizeText } from '../lib/sanitize.js';
import type { ResolvedPr } from '../lib/resolve.js';
import { SEVERITIES, type ReviewFinding, type ReviewResult, type SeverityName } from './schemas.js';

export const DEFAULT_FINDINGS_LIMIT = 20;
const RATIONALE_EXCERPT = 300;
const RATIONALE_FULL = 2000;
const SUGGESTION_MAX = 1000;
const SUMMARY_MAX = 600;
const TITLE_MAX = 200;

const rank = (s: SeverityName): number => SEVERITIES.indexOf(s);

export function sortFindings(findings: readonly FindingRecord[]): FindingRecord[] {
  return [...findings].sort(
    (a, b) =>
      rank(a.severity) - rank(b.severity) || a.file.localeCompare(b.file) || a.startLine - b.startLine,
  );
}

function toFinding(f: FindingRecord, includeDetails: boolean): ReviewFinding {
  const out: ReviewFinding = {
    id: f.id,
    severity: f.severity,
    category: f.category,
    title: sanitizeText(f.title, TITLE_MAX),
    file: sanitizeText(f.file, 300),
    start_line: f.startLine,
    end_line: f.endLine,
    confidence: f.confidence,
    rationale: sanitizeText(f.rationale, includeDetails ? RATIONALE_FULL : RATIONALE_EXCERPT),
  };
  if (includeDetails && f.suggestion) out.suggestion = sanitizeText(f.suggestion, SUGGESTION_MAX);
  return out;
}

export interface BuildArgs {
  resolved: ResolvedPr;
  repo: string;
  pr: number;
  webUrl: string;
  run: RunRecord;
  review: ReviewRecord | undefined;
  limit: number;
  cursor?: string | undefined;
  minSeverity?: SeverityName | undefined;
  includeDetails: boolean;
  nextStep?: string | null;
}

/** Builds the (status:'done') ReviewResult page. Throws BusinessError on a bad cursor. */
export function buildDoneResult(a: BuildArgs): ReviewResult {
  const all = sortFindings(a.review?.findings ?? []);
  const filtered = a.minSeverity ? all.filter((f) => rank(f.severity) <= rank(a.minSeverity as SeverityName)) : all;
  const scopeKey = `${a.run.runId}|${a.minSeverity ?? '-'}`;
  const offset = decodeCursor(a.cursor, scopeKey);

  const base = {
    repo: a.repo,
    pr: a.pr,
    run_id: a.run.runId,
    agent: a.run.agentName ? sanitizeText(a.run.agentName, 100) : null,
    status: 'done' as const,
    verdict: a.review?.verdict ?? null,
    score: a.review?.score ?? a.run.score ?? null,
    summary: a.review?.summary ? sanitizeText(a.review.summary, SUMMARY_MAX) : null,
    counts: {
      critical: all.filter((f) => f.severity === 'CRITICAL').length,
      warning: all.filter((f) => f.severity === 'WARNING').length,
      suggestion: all.filter((f) => f.severity === 'SUGGESTION').length,
    },
    total: filtered.length,
    web_url: a.webUrl,
  };
  const assemble = (page: FindingRecord[], nextCursor: string | null): ReviewResult => ({
    ...base,
    findings: page.map((f) => toFinding(f, a.includeDetails)),
    next_cursor: nextCursor,
    next_step:
      a.nextStep ??
      (nextCursor
        ? 'More findings: call get_findings with repo, pr, run_id and cursor = next_cursor.'
        : a.review
          ? null
          : 'The run finished but no review record was found; open web_url in DevDigest.'),
  });

  const page = paginate({
    all: filtered,
    offset,
    limit: a.limit,
    scopeKey,
    maxChars: MAX_RESPONSE_CHARS,
    measure: (p) => JSON.stringify(assemble(p, 'x'.repeat(60))).length,
  });
  return assemble(page.items, page.nextCursor);
}

/** Result for a run that is not (yet) done: no findings. */
export function buildPendingResult(
  a: Pick<BuildArgs, 'repo' | 'pr' | 'webUrl'> & { run: RunRecord | null; nextStep: string },
  status: 'running' | 'none',
): ReviewResult {
  return {
    repo: a.repo,
    pr: a.pr,
    run_id: a.run?.runId ?? null,
    agent: a.run?.agentName ? sanitizeText(a.run.agentName, 100) : null,
    status,
    verdict: null,
    score: null,
    summary: null,
    counts: { critical: 0, warning: 0, suggestion: 0 },
    total: 0,
    findings: [],
    next_cursor: null,
    web_url: a.webUrl,
    next_step: a.nextStep,
  };
}

export function webUrl(webBase: string, repoId: string, number: number): string {
  return `${webBase}/repos/${encodeURIComponent(repoId)}/pulls/${number}`;
}

/** failed/cancelled run -> recovery-instruction error (not a normal result). */
export function failedRunError(run: RunRecord): BusinessError {
  const reason = run.error ? sanitizeText(run.error, 300) : 'no error text was recorded';
  return new BusinessError({
    what: `Run ${run.runId} ${run.status === 'cancelled' ? 'was cancelled' : 'failed'}: ${reason}`,
    expected: 'a run that finishes with status done',
    example: 'run_agent_on_pr with repo "acme/payments-api", pr 482, agent "security-reviewer"',
    next: "check the agent's provider API key in DevDigest Settings, then re-run",
  });
}
