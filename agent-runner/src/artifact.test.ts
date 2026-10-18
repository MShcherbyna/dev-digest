import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CiResultArtifact } from '@devdigest/shared';
import { buildResultArtifact, REVIEWER_CORE_VERSION, RUNNER_VERSION, type BuildResultArtifactInput } from './artifact.js';

const base: BuildResultArtifactInput = {
  findings: [],
  costUsd: 0.01,
  durationMs: 1200,
  agent: 'Sec',
  prNumber: 7,
  event: 'REQUEST_CHANGES',
  blockers: 2,
  agentSlug: 'sec',
  agentId: 'a-1',
  manifestVersion: 3,
  provider: 'openrouter',
  model: 'm',
  commitSha: 'deadbeef',
  repo: 'acme/widgets',
  nodeVersion: 'v22.0.0',
};

describe('buildResultArtifact (AC-20)', () => {
  it('fills every extended field and passes CiResultArtifact', () => {
    const a = buildResultArtifact(base);
    expect(CiResultArtifact.safeParse(a).success).toBe(true);
    expect(a).toMatchObject({
      verdict: 'request_changes',
      blockers: 2,
      agent_slug: 'sec',
      agent_id: 'a-1',
      manifest_version: 3,
      provider: 'openrouter',
      model: 'm',
      runner_version: RUNNER_VERSION,
      dependencies: { reviewer_core: REVIEWER_CORE_VERSION, node: 'v22.0.0' },
      commit_sha: 'deadbeef',
      repo: 'acme/widgets',
    });
    expect(RUNNER_VERSION).toBe('3');
  });

  it('maps events to verdicts', () => {
    expect(buildResultArtifact({ ...base, event: 'APPROVE' }).verdict).toBe('approve');
    expect(buildResultArtifact({ ...base, event: 'COMMENT' }).verdict).toBe('comment');
  });

  it('REVIEWER_CORE_VERSION equals reviewer-core/package.json version', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../reviewer-core/package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    expect(REVIEWER_CORE_VERSION).toBe(pkg.version);
  });

  it('the contract rejects negative counts', () => {
    const a = buildResultArtifact(base);
    expect(CiResultArtifact.safeParse({ ...a, blockers: -1 }).success).toBe(false);
    expect(CiResultArtifact.safeParse({ ...a, critical: -1 }).success).toBe(false);
    expect(CiResultArtifact.safeParse({ ...a, cost_usd: -0.1 }).success).toBe(false);
  });
});
