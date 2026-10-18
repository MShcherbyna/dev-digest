import { describe, it, expect, vi } from 'vitest';
import { ConfigError } from '../../platform/errors.js';
import { MockCiGitHub, MockRunnerBundle } from '../../adapters/mocks.js';
import { CiGitHubError, type AgentSource, type CiLog, type CiStore, type InstallationRecord } from './ports.js';
import { CiService, toAppError } from './service.js';
import { CiIngestService } from './ingest.js';

const log: CiLog = { info: vi.fn(), warn: vi.fn() };
const WS = 'ws-1';
const REPO = { id: 'repo-1', fullName: 'acme/repo', defaultBranch: 'main' };
const AGENT = {
  id: 'agent-1',
  name: 'Unit Agent',
  provider: 'anthropic' as const,
  model: 'claude-sonnet-4',
  systemPrompt: 'review',
  strategy: 'auto' as const,
  ciFailOn: 'critical' as const,
  version: 2,
};

function installation(over: Partial<InstallationRecord> = {}): InstallationRecord {
  return {
    id: 'inst-1',
    agentId: AGENT.id,
    agentName: AGENT.name,
    agentVersion: 2,
    repo: REPO.fullName,
    targetType: 'gha',
    installedAt: new Date('2026-10-01T00:00:00Z'),
    agentSlug: 'unit-agent',
    mode: 'pr',
    manifestVersion: 2,
    postAs: 'github_review',
    triggers: ['opened'],
    skillSlugs: [],
    prUrl: null,
    removalPrUrl: null,
    lastRunAt: null,
    lastRunStatus: null,
    ...over,
  };
}

/** Minimal in-memory store: only what the service paths under test touch. */
function fakeStore(installations: InstallationRecord[] = []) {
  const upserts: unknown[] = [];
  const store = {
    repoForWorkspace: async (_ws: string, name: string) => (name === REPO.fullName ? REPO : undefined),
    memoryForExport: async () => [],
    listInstallationsByRepo: async () => installations,
    listInstallationsByAgent: async () => installations,
    listInstallations: async () => installations,
    getInstallation: async (_ws: string, id: string) => installations.find((i) => i.id === id),
    upsertInstallation: async (_ws: string, input: Record<string, unknown>) => {
      upserts.push(input);
      return installation({ ...(input as Partial<InstallationRecord>) });
    },
    oldestRunningRunAt: async () => null,
    lastTerminalRunAt: async () => null,
    findRun: async () => undefined,
    prFor: async () => undefined,
    setLastRun: async () => undefined,
    setRemovalPr: async () => undefined,
    ingestRun: async () => undefined,
  } as unknown as CiStore;
  return { store, upserts };
}

const agents: AgentSource = { get: async () => AGENT, enabledSkills: async () => [] };
const exportInput = (over = {}) => ({
  repo: REPO.fullName,
  target: 'gha' as const,
  action: 'open_pr' as const,
  post_as: 'github_review' as const,
  triggers: ['opened' as const, 'synchronize' as const],
  base: 'main',
  mode: 'pr' as const,
  ...over,
});

function service(gh: () => Promise<MockCiGitHub>, installations: InstallationRecord[] = []) {
  const { store, upserts } = fakeStore(installations);
  return { svc: new CiService({ store, agents, github: gh, bundle: new MockRunnerBundle() }), upserts };
}

describe('toAppError (AC-16 / AC-36 mapping)', () => {
  it.each([
    ['contents', 'contents'],
    ['pull_requests', 'pull_requests'],
    ['workflows', 'workflows'],
    ['actions', 'contents'],
  ] as const)('permission %s -> 403 naming %s', (given, named) => {
    const e = toAppError(new CiGitHubError('permission', 'x', given));
    expect(e).toMatchObject({ code: 'github_permission', statusCode: 403, details: { permission: named } });
  });

  it.each(['auth', 'rate_limited', 'network', 'unexpected'] as const)('%s -> 502 github_error', (kind) => {
    expect(toAppError(new CiGitHubError(kind, 'x'))).toMatchObject({ code: 'github_error', statusCode: 502 });
  });

  it('wraps a non-GitHub error as 502 github_error without leaking its message', () => {
    const e = toAppError(new Error('secret internal detail'));
    expect(e).toMatchObject({ code: 'github_error', statusCode: 502 });
    expect(e.message).not.toContain('secret');
  });
});

describe('CiService', () => {
  it('manual export never asks for GitHub (no token needed) and records a manual install', async () => {
    const github = vi.fn(async () => {
      throw new ConfigError('GITHUB_TOKEN is not configured');
    });
    const { svc, upserts } = service(github as never);
    const res = await svc.exportCi(WS, AGENT.id, exportInput({ mode: 'manual' }), log);
    expect(github).not.toHaveBeenCalled();
    expect(res.pr_url).toBeNull();
    expect(upserts[0]).toMatchObject({ mode: 'manual', prUrl: null, agentSlug: 'unit-agent', manifestVersion: 2 });
  });

  it('pr export without a token is 422 github_token_missing and records nothing', async () => {
    const { svc, upserts } = service(async () => {
      throw new ConfigError('GITHUB_TOKEN is not configured');
    });
    await expect(svc.exportCi(WS, AGENT.id, exportInput(), log)).rejects.toMatchObject({
      code: 'github_token_missing',
      statusCode: 422,
    });
    expect(upserts).toHaveLength(0);
  });

  it('preview without a token degrades instead of failing', async () => {
    const { svc } = service(async () => {
      throw new ConfigError('GITHUB_TOKEN is not configured');
    });
    const res = await svc.preview(WS, AGENT.id, {
      repo: REPO.fullName,
      target: 'gha',
      triggers: ['opened'],
      post_as: 'none',
    });
    expect(res.pr_open).toBe(false);
    expect(res.secrets).toEqual([
      { name: 'OPENROUTER_API_KEY', status: 'unknown' },
      { name: 'GITHUB_TOKEN', status: 'ready' },
    ]);
  });

  it('NFR-1: export makes at most 7 calls and remove at most 8, whatever the file count', async () => {
    const gh = new MockCiGitHub();
    const { svc } = service(async () => gh);
    await svc.exportCi(WS, AGENT.id, exportInput(), log);
    expect(gh.calls.length).toBeLessThanOrEqual(7);

    const gh2 = new MockCiGitHub({ files: { '.devdigest/agents/unit-agent.yaml': 'x', '.devdigest/memory.jsonl': '' } });
    const { svc: svc2 } = service(async () => gh2, [installation()]);
    await svc2.remove(WS, 'inst-1', log);
    expect(gh2.calls.length).toBeLessThanOrEqual(8);
  });

  it('logs ids and counts only — never file contents (NFR-6)', async () => {
    const info = vi.fn();
    const gh = new MockCiGitHub();
    const { svc } = service(async () => gh);
    await svc.exportCi(WS, AGENT.id, exportInput(), { info, warn: vi.fn() });
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).toContain('"files":4');
    expect(logged).not.toContain('review'); // system prompt text
    expect(logged).not.toContain('runner bundle');
  });
});

describe('CiIngestService in-flight join (AC-21)', () => {
  it('a refresh that arrives mid-ingest joins it: one set of GitHub calls', async () => {
    const gh = new MockCiGitHub();
    let release!: () => void;
    gh.gate = new Promise<void>((r) => (release = r));
    const { store } = fakeStore([installation()]);
    const ingest = new CiIngestService({ store, github: async () => gh });

    const a = ingest.refresh(WS, undefined, log);
    const b = ingest.refresh(WS, undefined, log);
    await new Promise((r) => setTimeout(r, 20));
    release();
    await Promise.all([a, b]);
    expect(gh.count('listWorkflowRuns')).toBe(1);

    await ingest.refresh(WS, undefined, log); // a later refresh starts a fresh ingest
    expect(gh.count('listWorkflowRuns')).toBe(2);
  });

  it('every installation failing with a network error is 502, a partial failure is a 200 with errors', async () => {
    const gh = new MockCiGitHub();
    gh.failOn.set('listWorkflowRuns', new CiGitHubError('network', 'down'));
    const two = [installation(), installation({ id: 'inst-2', agentSlug: 'other' })];
    const { store } = fakeStore(two);
    const ingest = new CiIngestService({ store, github: async () => gh });
    await expect(ingest.refresh(WS, undefined, log)).rejects.toMatchObject({ code: 'github_error', statusCode: 502 });

    let calls = 0;
    const flaky = new MockCiGitHub();
    const orig = flaky.listWorkflowRuns.bind(flaky);
    flaky.listWorkflowRuns = async (...args) => {
      if (calls++ === 0) throw new CiGitHubError('rate_limited', 'slow');
      return orig(...args);
    };
    const partial = new CiIngestService({ store, github: async () => flaky });
    const res = await partial.refresh(WS, undefined, log);
    expect(res.errors).toEqual([{ installation_id: 'inst-1', code: 'rate_limited' }]);
  });
});
