import { describe, it, expect } from 'vitest';
import { groupFindings, applyGroupIds, buildLocations, isConflict } from './grouping.js';
import type { AgentColumnView } from '../schemas.js';

function finding(overrides: Partial<AgentColumnView['findings'][number]> & { id: string }): AgentColumnView['findings'][number] {
  return {
    severity: 'WARNING',
    category: 'bug',
    title: overrides.title ?? `title-${overrides.id}`,
    file: overrides.file ?? 'file.ts',
    start_line: overrides.start_line ?? 10,
    end_line: overrides.end_line ?? overrides.start_line ?? 10,
    kind: null,
    confidence: 0.9,
    rationale: 'because',
    suggested_fix: null,
    group_id: null,
    ...overrides,
    id: overrides.id,
  };
}

function column(overrides: Partial<AgentColumnView> & { agent_id: string }): AgentColumnView {
  return {
    run_id: `run-${overrides.agent_id}`,
    agent_name: overrides.agent_name ?? overrides.agent_id,
    provider: 'openai',
    model: 'gpt',
    status: 'done',
    verdict: 'comment',
    score: 80,
    summary: 'summary',
    duration_ms: 1000,
    cost_usd: 0.01,
    findings: [],
    ...overrides,
    agent_id: overrides.agent_id,
  };
}

describe('groupFindings', () => {
  it('groups overlapping findings in the same file from different agents', () => {
    const columns: AgentColumnView[] = [
      column({ agent_id: 'security', findings: [finding({ id: 'f1', file: 'file.ts', start_line: 10, end_line: 14 })] }),
      column({ agent_id: 'perf', findings: [finding({ id: 'f2', file: 'file.ts', start_line: 12, end_line: 18 })] }),
    ];
    const { groupIdByFinding, groups } = groupFindings(columns);
    expect(groupIdByFinding.get('f1')).toBe('f1');
    expect(groupIdByFinding.get('f2')).toBe('f1');
    expect(groups).toHaveLength(1);
  });

  it('does not group a non-overlapping finding at the same file', () => {
    const columns: AgentColumnView[] = [
      column({
        agent_id: 'security',
        findings: [
          finding({ id: 'f1', file: 'file.ts', start_line: 10, end_line: 14 }),
          finding({ id: 'f3', file: 'file.ts', start_line: 40, end_line: 42 }),
        ],
      }),
      column({ agent_id: 'perf', findings: [finding({ id: 'f2', file: 'file.ts', start_line: 12, end_line: 18 })] }),
    ];
    const { groupIdByFinding, groups } = groupFindings(columns);
    expect(groupIdByFinding.get('f1')).toBe('f1');
    expect(groupIdByFinding.get('f2')).toBe('f1');
    expect(groupIdByFinding.get('f3')).toBeNull();
    expect(groups).toHaveLength(2);
  });

  it('a finding touching two others\' ranges joins only the FIRST group it matches, never both', () => {
    // a (10-12, security) and b (20-22, perf) are themselves non-overlapping,
    // so they start as two separate groups. c (11-21, mentor) overlaps BOTH
    // ranges directly: processed in start_line order (a, then c, then b), c
    // matches the FIRST existing group (a's) and joins only that ONE group —
    // a finding is never assigned more than one group_id. b is then evaluated
    // against the (now-expanded) group and — since b genuinely overlaps c's
    // range too — correctly joins the same cluster: this is the expected
    // transitive-overlap outcome, not a second group_id on c.
    const columns: AgentColumnView[] = [
      column({ agent_id: 'security', findings: [finding({ id: 'a', file: 'file.ts', start_line: 10, end_line: 12 })] }),
      column({ agent_id: 'perf', findings: [finding({ id: 'b', file: 'file.ts', start_line: 20, end_line: 22 })] }),
      column({ agent_id: 'mentor', findings: [finding({ id: 'c', file: 'file.ts', start_line: 11, end_line: 21 })] }),
    ];
    const { groupIdByFinding, groups } = groupFindings(columns);
    // Exactly one group_id each — the first (earliest-created) group's id.
    expect(groupIdByFinding.get('a')).toBe('a');
    expect(groupIdByFinding.get('c')).toBe('a');
    expect(groupIdByFinding.get('b')).toBe('a');
    expect(groups).toHaveLength(1);
    expect(groups[0]!.map((m) => m.findingId).sort()).toEqual(['a', 'b', 'c']);
  });

  it('a finding touching a group AND a disjoint singleton with no further members joins only the first (true isolation case)', () => {
    // a1+a2 (security, perf) already merge into group A by the time the
    // straddler is evaluated; the straddler also overlaps b (customer), a
    // SEPARATE, already-closed group with no further pending members — so
    // nothing re-evaluates b afterward, and it stays exactly as it was.
    const columns: AgentColumnView[] = [
      column({ agent_id: 'security', findings: [finding({ id: 'a1', file: 'file.ts', start_line: 10, end_line: 12 })] }),
      column({ agent_id: 'perf', findings: [finding({ id: 'a2', file: 'file.ts', start_line: 11, end_line: 13 })] }),
      column({ agent_id: 'customer', findings: [finding({ id: 'b', file: 'file.ts', start_line: 40, end_line: 42 })] }),
      // Overlaps a2 (11-13) directly; does NOT reach anywhere near b (40-42) — b truly stays untouched.
      column({ agent_id: 'mentor', findings: [finding({ id: 'c', file: 'file.ts', start_line: 12, end_line: 14 })] }),
    ];
    const { groupIdByFinding, groups } = groupFindings(columns);
    expect(groupIdByFinding.get('a1')).toBe('a1');
    expect(groupIdByFinding.get('a2')).toBe('a1');
    expect(groupIdByFinding.get('c')).toBe('a1');
    expect(groupIdByFinding.get('b')).toBeNull();
    expect(groups).toHaveLength(2);
  });

  it('never alters an original finding field — only adds group_id (AC-21)', () => {
    const f1 = finding({ id: 'f1', file: 'file.ts', start_line: 10, end_line: 14, title: 'Original title' });
    const f2 = finding({ id: 'f2', file: 'file.ts', start_line: 12, end_line: 18 });
    const columns: AgentColumnView[] = [
      column({ agent_id: 'security', findings: [f1] }),
      column({ agent_id: 'perf', findings: [f2] }),
    ];
    const { groupIdByFinding } = groupFindings(columns);
    const [withGroups] = applyGroupIds(columns, groupIdByFinding);
    const applied = withGroups!.findings[0]!;
    expect(applied).toEqual({ ...f1, group_id: 'f1' });
  });

  it('two agents at the same file:line that do not overlap each other at all stay singletons', () => {
    const columns: AgentColumnView[] = [
      column({ agent_id: 'security', findings: [finding({ id: 'f1', file: 'a.ts', start_line: 1, end_line: 2 })] }),
      column({ agent_id: 'perf', findings: [finding({ id: 'f2', file: 'b.ts', start_line: 1, end_line: 2 })] }),
    ];
    const { groupIdByFinding, groups } = groupFindings(columns);
    expect(groupIdByFinding.get('f1')).toBeNull();
    expect(groupIdByFinding.get('f2')).toBeNull();
    expect(groups).toHaveLength(2);
  });
});

describe('buildLocations / isConflict (AC-23/AC-24/AC-25)', () => {
  it('a severity disagreement is a conflict', () => {
    const columns: AgentColumnView[] = [
      column({
        agent_id: 'security',
        agent_name: 'Security',
        status: 'done',
        findings: [finding({ id: 'f1', file: 'a.ts', start_line: 1, end_line: 2, severity: 'CRITICAL' })],
      }),
      column({
        agent_id: 'perf',
        agent_name: 'Performance',
        status: 'done',
        findings: [finding({ id: 'f2', file: 'a.ts', start_line: 1, end_line: 2, severity: 'SUGGESTION' })],
      }),
    ];
    const { groups } = groupFindings(columns);
    const locations = buildLocations(groups, columns);
    expect(locations).toHaveLength(1);
    expect(isConflict(locations[0]!)).toBe(true);
  });

  it('agreement (both flagged the same severity) is not a conflict', () => {
    const columns: AgentColumnView[] = [
      column({
        agent_id: 'security',
        status: 'done',
        findings: [finding({ id: 'f1', file: 'a.ts', start_line: 1, end_line: 2, severity: 'WARNING' })],
      }),
      column({
        agent_id: 'perf',
        status: 'done',
        findings: [finding({ id: 'f2', file: 'a.ts', start_line: 1, end_line: 2, severity: 'WARNING' })],
      }),
    ];
    const { groups } = groupFindings(columns);
    const locations = buildLocations(groups, columns);
    expect(isConflict(locations[0]!)).toBe(false);
  });

  it('one agent flagging + another not flagging ("did not flag") is a conflict', () => {
    const columns: AgentColumnView[] = [
      column({
        agent_id: 'security',
        status: 'done',
        findings: [finding({ id: 'f1', file: 'a.ts', start_line: 1, end_line: 2, severity: 'WARNING' })],
      }),
      column({ agent_id: 'perf', status: 'done', findings: [] }),
    ];
    const { groups } = groupFindings(columns);
    const locations = buildLocations(groups, columns);
    expect(locations).toHaveLength(1);
    const perfTake = locations[0]!.takes.find((t) => t.agent_id === 'perf')!;
    expect(perfTake.verdict).toBe('ignored');
    expect(isConflict(locations[0]!)).toBe(true);
  });

  it('a running or failed column gets no take at all (Q-8)', () => {
    const columns: AgentColumnView[] = [
      column({
        agent_id: 'security',
        status: 'done',
        findings: [finding({ id: 'f1', file: 'a.ts', start_line: 1, end_line: 2 })],
      }),
      column({ agent_id: 'perf', status: 'running', findings: [] }),
      column({ agent_id: 'mentor', status: 'failed', findings: [] }),
    ];
    const { groups } = groupFindings(columns);
    const locations = buildLocations(groups, columns);
    const agentIds = locations[0]!.takes.map((t) => t.agent_id);
    expect(agentIds).toEqual(['security']);
  });
});
