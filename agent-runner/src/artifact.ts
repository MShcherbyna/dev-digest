import type { Finding, Verdict } from '@devdigest/shared';
import { CiResultArtifact } from '@devdigest/shared';
import { RunnerError } from './errors.js';

/** Runner version string embedded in every artifact (informational only). */
export const RUNNER_VERSION = '2';

/** Mirrors `reviewer-core/package.json` `version`; `artifact.test.ts` asserts they match. */
export const REVIEWER_CORE_VERSION = '0.0.0';

/** GitHub review event from the deterministic payload -> artifact verdict. */
export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
const EVENT_TO_VERDICT: Record<ReviewEvent, Verdict> = {
  APPROVE: 'approve',
  REQUEST_CHANGES: 'request_changes',
  COMMENT: 'comment',
};

export interface BuildResultArtifactInput {
  findings: Finding[];
  costUsd: number | null;
  durationMs: number;
  agent: string;
  prNumber: number;
  /** Deterministic payload event (never the model's self-reported verdict). */
  event: ReviewEvent;
  blockers: number;
  agentSlug: string;
  agentId: string | null;
  manifestVersion: number | null;
  provider: string;
  model: string;
  commitSha: string | null;
  /** "owner/name" */
  repo: string;
  /** Overridable for tests; defaults to `process.version`. */
  nodeVersion?: string;
}

function severityCounts(findings: Finding[]): { critical: number; warning: number; suggestion: number } {
  const counts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL') counts.critical++;
    else if (f.severity === 'WARNING') counts.warning++;
    else counts.suggestion++;
  }
  return counts;
}

/**
 * Build + validate the `devdigest-result.json` artifact (AC-26). Validated
 * against the SAME `CiResultArtifact` Zod contract the studio's ingest path
 * (T6) will `safeParse` on the way back in, so a malformed artifact fails
 * loudly here rather than silently on ingest.
 */
export function buildResultArtifact(input: BuildResultArtifactInput): CiResultArtifact {
  const counts = severityCounts(input.findings);
  const candidate = {
    findings_count: input.findings.length,
    critical: counts.critical,
    warning: counts.warning,
    suggestion: counts.suggestion,
    cost_usd: input.costUsd,
    duration_ms: input.durationMs,
    agent: input.agent,
    version: RUNNER_VERSION,
    pr_number: input.prNumber,
    verdict: EVENT_TO_VERDICT[input.event],
    blockers: input.blockers,
    agent_slug: input.agentSlug,
    agent_id: input.agentId,
    manifest_version: input.manifestVersion,
    provider: input.provider,
    model: input.model,
    runner_version: RUNNER_VERSION,
    dependencies: {
      reviewer_core: REVIEWER_CORE_VERSION,
      node: input.nodeVersion ?? process.version,
    },
    commit_sha: input.commitSha,
    repo: input.repo,
  };
  const result = CiResultArtifact.safeParse(candidate);
  if (!result.success) {
    // Should be unreachable — every field above is shaped to the schema. If
    // this ever fires it's a genuine internal bug, not a user/config error.
    throw new RunnerError(
      `Internal error: built result artifact failed CiResultArtifact validation: ${result.error.message}`,
    );
  }
  return result.data;
}
