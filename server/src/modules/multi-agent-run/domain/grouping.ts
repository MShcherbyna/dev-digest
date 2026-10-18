import type { AgentColumnFindingView, AgentColumnView } from '../schemas.js';
import type { Conflict, ConflictTake } from '@devdigest/shared';

/**
 * AC-20/AC-21/AC-22/AC-23/AC-24/AC-25 — similarity grouping and the "Where
 * agents disagree" block. Pure functions over one run's columns; no
 * persistence, no zod, no drizzle (onion-architecture `domain/`). Computed on
 * read each `GET`, per the plan's R2 (runs are small, ≤8 agents).
 */

export interface GroupedFinding {
  findingId: string;
  agentId: string;
  file: string;
  startLine: number;
  endLine: number;
  severity: string;
  title: string;
}

/** The result of grouping: which group (if any, >=2 members) each finding
 * joined, plus every group in location order (singletons included). */
export interface GroupingResult {
  /** findingId -> group_id, or null for a singleton. */
  groupIdByFinding: Map<string, string | null>;
  /** Every group (1+ members), file/line-ordered, first-seen order within a tie. */
  groups: GroupedFinding[][];
}

function overlaps(a: GroupedFinding, b: GroupedFinding): boolean {
  return a.startLine <= b.endLine && b.startLine <= a.endLine;
}

/**
 * Group similar findings across the columns' agents (AC-20). Columns arrive
 * in `requested_agent_ids` order; findings are then sorted by `file`,
 * `start_line`, `id` for a deterministic, order-independent result.
 *
 * Rule: a finding joins the FIRST existing group that (a) shares its `file`,
 * (b) has no member from the same agent, and (c) has at least one member
 * whose line range overlaps this finding's — otherwise it opens a new group.
 * A finding never joins more than one group, even if it overlaps two (AC-20's
 * "touches two -> joins only the first" case).
 *
 * Never mutates or copies a finding's own fields (AC-21) — only produces the
 * `group_id` pointer, applied by the caller.
 */
export function groupFindings(columns: AgentColumnView[]): GroupingResult {
  const all: GroupedFinding[] = [];
  for (const col of columns) {
    for (const f of col.findings) {
      all.push({
        findingId: f.id,
        agentId: col.agent_id,
        file: f.file,
        startLine: f.start_line,
        endLine: f.end_line,
        severity: f.severity,
        title: f.title,
      });
    }
  }
  all.sort((a, b) => a.file.localeCompare(b.file) || a.startLine - b.startLine || a.findingId.localeCompare(b.findingId));

  const groups: GroupedFinding[][] = [];
  for (const finding of all) {
    const joined = groups.find(
      (g) =>
        g[0]!.file === finding.file &&
        g.every((m) => m.agentId !== finding.agentId) &&
        g.some((m) => overlaps(m, finding)),
    );
    if (joined) joined.push(finding);
    else groups.push([finding]);
  }

  const groupIdByFinding = new Map<string, string | null>();
  for (const g of groups) {
    const groupId = g.length >= 2 ? g[0]!.findingId : null;
    for (const m of g) groupIdByFinding.set(m.findingId, groupId);
  }

  return { groupIdByFinding, groups };
}

/** Apply a `GroupingResult` to a column's findings — the only mutation
 * allowed (AC-21: every other field stays byte-identical). */
export function applyGroupIds(
  columns: AgentColumnView[],
  groupIdByFinding: Map<string, string | null>,
): AgentColumnView[] {
  return columns.map((col) => ({
    ...col,
    findings: col.findings.map((f) => applyGroupId(f, groupIdByFinding)),
  }));
}

function applyGroupId(
  finding: AgentColumnFindingView,
  groupIdByFinding: Map<string, string | null>,
): AgentColumnFindingView {
  return { ...finding, group_id: groupIdByFinding.get(finding.id) ?? null };
}

/**
 * AC-24/AC-25 — build the "Where agents disagree" locations: one `Conflict`
 * per group (including singletons, so the toggle-off view can show
 * agreement locations too). `takes` has one entry per column with status
 * `done` — a column that is `queued`/`running`/`failed`/`cancelled` for THIS
 * run gets no take and does not count toward a conflict (Q-8); the client
 * renders that agent's cell from the column's own status instead.
 */
export function buildLocations(groups: GroupedFinding[][], columns: AgentColumnView[]): Conflict[] {
  const doneColumns = columns.filter((c) => c.status === 'done');
  return groups.map((group) => {
    const first = group[0]!;
    const line = Math.min(...group.map((m) => m.startLine));
    const byAgent = new Map(group.map((m) => [m.agentId, m]));
    const takes: ConflictTake[] = doneColumns.map((col) => {
      const member = byAgent.get(col.agent_id);
      return {
        agent_id: col.agent_id,
        persona: col.agent_name,
        verdict: member ? (member.severity as ConflictTake['verdict']) : 'ignored',
        note: member ? member.title : '',
      };
    });
    return { file: first.file, line, title: first.title, takes };
  });
}

/** AC-23: a location is a conflict when its takes show more than one
 * distinct verdict (a severity, or `'ignored'` for "did not flag"). */
export function isConflict(conflict: Conflict): boolean {
  return new Set(conflict.takes.map((t) => t.verdict)).size > 1;
}
