import type {
  ActiveRunRecord,
  AgentRecord,
  ConventionRecord,
  DevDigestGateway,
  FindingRecord,
  RunStatus,
  PullRecord,
  RepoRecord,
  ReviewRecord,
  RunRecord,
} from '../../src/gateway/ports.js';

export interface FakeState {
  agents: AgentRecord[];
  repos: RepoRecord[];
  pulls: Record<string, PullRecord[]>; // by repo id
  runs: RunRecord[];
  reviews: ReviewRecord[];
  conventions: ConventionRecord[];
  /** status per poll for runs started via startReview (last entry repeats) */
  startedStatuses: RunStatus[];
  startCount: number;
  throwOnAll?: Error;
}

export const agent = (id: string, name: string, enabled = true): AgentRecord => ({
  id, name, description: `${name} description`, provider: 'openai', model: 'gpt-5.4', enabled,
});

export const finding = (i: number, severity: FindingRecord['severity'] = 'WARNING'): FindingRecord => ({
  id: `f${i}`, severity, category: 'bug', title: `Finding ${i}`, file: `src/f${i % 5}.ts`,
  startLine: i + 1, endLine: i + 2, rationale: `Because ${i}. `.repeat(40), suggestion: `Fix ${i}`, confidence: 0.8,
});

export const review = (runId: string, findings: FindingRecord[]): ReviewRecord => ({
  id: `rev-${runId}`, runId, agentId: 'a1', agentName: 'Security Reviewer',
  verdict: 'request_changes', summary: 'Needs work', score: 55, findings,
});

export function makeFake(over: Partial<FakeState> = {}): DevDigestGateway & { state: FakeState } {
  const state: FakeState = {
    agents: [agent('a1', 'Security Reviewer'), agent('a2', 'Style Bot', false)],
    repos: [{ id: 'repo1', owner: 'acme', name: 'payments-api', fullName: 'acme/payments-api' }],
    pulls: { repo1: [{ id: 'pr1', number: 482, title: 'Add payments' }] },
    runs: [],
    reviews: [],
    conventions: [],
    startedStatuses: ['running', 'running', 'done'],
    startCount: 0,
    ...over,
  };
  const pollCounts = new Map<string, number>();
  const guard = (): void => {
    if (state.throwOnAll) throw state.throwOnAll;
  };
  return {
    state,
    async listAgents() { guard(); return state.agents; },
    async findRepo(name) { guard(); return state.repos.find((r) => r.fullName.toLowerCase() === name.toLowerCase()) ?? null; },
    async findPull(repoId, n) { guard(); return (state.pulls[repoId] ?? []).find((p) => p.number === n) ?? null; },
    async activeRuns(): Promise<ActiveRunRecord[]> {
      guard();
      return state.runs.filter((r) => r.status === 'running').map((r) => ({ runId: r.runId, agentId: r.agentId }));
    },
    async startReview(_pr, agentId) {
      guard();
      state.startCount++;
      const runId = `run${state.startCount}`;
      state.runs.unshift({ runId, agentId, agentName: 'x', status: 'running', error: null, score: null });
      return { runId };
    },
    async listRuns() {
      guard();
      for (const r of state.runs) {
        if (!r.runId.startsWith('run')) continue;
        const n = pollCounts.get(r.runId) ?? 0;
        const next = state.startedStatuses[Math.min(n, state.startedStatuses.length - 1)];
        if (r.status === 'running' && next && next !== 'running') {
          r.status = next;
          if (next === 'failed') r.error = 'LLM key missing';
        }
        pollCounts.set(r.runId, n + 1);
      }
      return state.runs;
    },
    async reviewsForPull() { guard(); return state.reviews; },
    async conventions() { guard(); return { headSha: 'abc123', items: state.conventions }; },
  };
}
