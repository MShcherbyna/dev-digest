import { describe, it, expect } from 'vitest';
import { ciRunStatus, prNumberFromUrl, validateArtifact } from './artifact.js';

const expected = { repo: 'acme/repo', agentSlug: 'sec', agentId: 'agent-1' };
const artifact = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    findings_count: 2,
    cost_usd: 0.01,
    agent: 'Sec',
    repo: 'acme/repo',
    agent_slug: 'sec',
    ...over,
  });

describe('validateArtifact (AC-23)', () => {
  it('accepts a matching artifact (repo compared case-insensitively)', () => {
    expect(validateArtifact(artifact({ repo: 'Acme/Repo' }), expected).ok).toBe(true);
  });

  it.each([
    ['not json', 'nope{', 'not_json'],
    ['schema failure', artifact({ findings_count: -1 }), 'schema'],
    ['missing repo', artifact({ repo: null }), 'repo_mismatch'],
    ['another repo', artifact({ repo: 'evil/repo' }), 'repo_mismatch'],
    ['missing slug', artifact({ agent_slug: null }), 'agent_mismatch'],
    ['another agent slug', artifact({ agent_slug: 'other' }), 'agent_mismatch'],
    ['another agent id', artifact({ agent_id: 'agent-2' }), 'agent_mismatch'],
  ])('rejects %s', (_n, text, reason) => {
    expect(validateArtifact(text, expected)).toEqual({ ok: false, reason });
  });

  it('accepts a matching agent id', () => {
    expect(validateArtifact(artifact({ agent_id: 'agent-1' }), expected).ok).toBe(true);
  });
});

describe('ciRunStatus', () => {
  it('zero findings -> no_findings, otherwise succeeded (a tripped gate is still succeeded)', () => {
    expect(ciRunStatus(0)).toBe('no_findings');
    expect(ciRunStatus(3)).toBe('succeeded');
  });
});

describe('prNumberFromUrl', () => {
  it('reads the PR number', () => {
    expect(prNumberFromUrl('https://github.com/a/b/pull/42')).toBe(42);
    expect(prNumberFromUrl('https://github.com/a/b/pull/42#x')).toBe(42);
    expect(prNumberFromUrl('https://github.com/a/b')).toBeNull();
  });
});
