import { CiResultArtifact, type CiRunStatus } from '@devdigest/shared';

export interface ArtifactExpectation {
  repo: string;
  agentSlug: string;
  agentId: string;
}

export type ArtifactCheck =
  | { ok: true; artifact: CiResultArtifact }
  | { ok: false; reason: 'not_json' | 'schema' | 'repo_mismatch' | 'agent_mismatch' };

/**
 * The artifact is UNTRUSTED (AC-23): parse, validate with the shared schema, and
 * require `repo` and `agent_slug` to equal the installation's. `agent_id` must
 * match too when present.
 */
export function validateArtifact(text: string, expected: ArtifactExpectation): ArtifactCheck {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not_json' };
  }
  const parsed = CiResultArtifact.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'schema' };
  const a = parsed.data;
  if (!a.repo || a.repo.toLowerCase() !== expected.repo.toLowerCase()) {
    return { ok: false, reason: 'repo_mismatch' };
  }
  if (a.agent_slug !== expected.agentSlug) return { ok: false, reason: 'agent_mismatch' };
  if (a.agent_id && a.agent_id !== expected.agentId) return { ok: false, reason: 'agent_mismatch' };
  return { ok: true, artifact: a };
}

/** E-6: a tripped gate is still a succeeded run; only zero findings is `no_findings`. */
export function ciRunStatus(findingsCount: number): CiRunStatus {
  return findingsCount === 0 ? 'no_findings' : 'succeeded';
}

/** GitHub PR number from its URL (`…/pull/42`), or null. */
export function prNumberFromUrl(url: string): number | null {
  const m = /\/pull\/(\d+)(?:[/?#]|$)/.exec(url);
  return m ? Number(m[1]) : null;
}
