import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import type {
  Skill,
  SkillCreate,
  SkillImportPreview,
  SkillImportPreviewBody,
  SkillStats,
  SkillSummary,
  SkillUpdate,
  SkillVersion,
} from '@devdigest/shared';
import { INITIAL_SKILL_VERSION, MAX_IMPORT_BYTES, STATS_WINDOW_DAYS } from './constants.js';
import {
  estimateTokens,
  includesSkillBlock,
  parseSkillImport,
  pct,
  toSkillDto,
  toSkillVersionDto,
} from './helpers.js';
import {
  SkillsRepository,
  type RunFindingRow,
  type RunSkillsRow,
  type SkillRow,
} from './repository.js';

/** Usage numbers for one skill, computed from runs of its bound agents. */
interface Usage {
  agents: Array<{ id: string; name: string }>;
  runsTotal: number;
  runsWithSkill: number;
  findings: RunFindingRow[];
}

/**
 * Skills — reusable text-only prompt blocks bound to agents. A skill is never
 * executed; its body is only ever inserted into a prompt.
 */
export class SkillsService {
  private repo: SkillsRepository;

  constructor(container: Container, repo?: SkillsRepository) {
    this.repo = repo ?? new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<SkillSummary[]> {
    const rows = await this.repo.list(workspaceId);
    const usage = await this.usageFor(workspaceId, rows);
    return rows.map((row) => {
      const u = usage.get(row.id)!;
      const accepted = u.findings.filter((f) => f.accepted).length;
      return {
        ...toSkillDto(row),
        tokens: estimateTokens(row.body),
        agents_count: u.agents.length,
        pull_pct: pct(u.runsWithSkill, u.runsTotal),
        accept_pct: pct(accepted, u.findings.length),
      };
    });
  }

  async get(workspaceId: string, id: string): Promise<Skill> {
    return toSkillDto(await this.require(workspaceId, id));
  }

  async create(workspaceId: string, input: SkillCreate): Promise<Skill> {
    const row = await this.repo.insert({ workspaceId, ...input });
    return toSkillDto(row);
  }

  /** Any update bumps `version` and records a `skill_versions` row. */
  async update(workspaceId: string, id: string, patch: SkillUpdate): Promise<Skill> {
    const row = await this.repo.update(workspaceId, id, patch);
    if (!row) throw new NotFoundError('Skill not found');
    return toSkillDto(row);
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    if (!(await this.repo.deleteById(workspaceId, id))) throw new NotFoundError('Skill not found');
  }

  /** Body history, newest first. Workspace-scoped via the ownership check. */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[]> {
    await this.require(workspaceId, id);
    return (await this.repo.listVersions(id)).map(toSkillVersionDto);
  }

  /**
   * Restore = roll forward: copy the chosen version's body into a NEW version
   * (history is never rewritten). v1 and the current version can't be restored.
   */
  async restoreVersion(workspaceId: string, id: string, version: number): Promise<Skill> {
    const skill = await this.require(workspaceId, id);
    if (version === INITIAL_SKILL_VERSION) {
      throw new ValidationError('The first version cannot be restored');
    }
    if (version === skill.version) {
      throw new ValidationError('This is already the current version');
    }
    const target = await this.repo.getVersion(id, version);
    if (!target) throw new NotFoundError('Skill version not found');
    return this.update(workspaceId, id, { body: target.body });
  }

  async stats(workspaceId: string, id: string): Promise<SkillStats> {
    const row = await this.require(workspaceId, id);
    const u = (await this.usageFor(workspaceId, [row])).get(id)!;
    const accepted = u.findings.filter((f) => f.accepted).length;
    const counts = new Map<string, number>();
    for (const f of u.findings) counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
    return {
      used_by: u.agents.length,
      pull_pct: pct(u.runsWithSkill, u.runsTotal),
      accept_pct: pct(accepted, u.findings.length),
      findings_30d: u.findings.length,
      agents: u.agents,
      by_category: [...counts.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    };
  }

  /** Parse an uploaded .md into a preview. Persists nothing. */
  importPreview(body: SkillImportPreviewBody): SkillImportPreview {
    if (Buffer.byteLength(body.content, 'utf8') > MAX_IMPORT_BYTES) {
      throw new ValidationError(`File too large (max ${MAX_IMPORT_BYTES / 1024} KB)`);
    }
    return parseSkillImport(body.filename, body.content);
  }

  private async require(workspaceId: string, id: string): Promise<SkillRow> {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) throw new NotFoundError('Skill not found');
    return row;
  }

  /**
   * Usage for many skills with a constant number of queries: bindings, then the
   * last-30d runs of all bound agents, then findings of the runs that included
   * each skill.
   */
  private async usageFor(workspaceId: string, skills: SkillRow[]): Promise<Map<string, Usage>> {
    const bindings = await this.repo.bindings(
      workspaceId,
      skills.map((s) => s.id),
    );
    const agentIds = [...new Set(bindings.map((b) => b.agentId))];
    const since = new Date(Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const runs = await this.repo.recentRuns(workspaceId, agentIds, since);
    const runsByAgent = new Map<string, RunSkillsRow[]>();
    for (const r of runs) runsByAgent.set(r.agentId, [...(runsByAgent.get(r.agentId) ?? []), r]);

    const included = new Map<string, RunSkillsRow[]>();
    const usage = new Map<string, Usage>();
    for (const skill of skills) {
      const agents = bindings
        .filter((b) => b.skillId === skill.id)
        .map((b) => ({ id: b.agentId, name: b.agentName }));
      const skillRuns = agents.flatMap((a) => runsByAgent.get(a.id) ?? []);
      const withSkill = skillRuns.filter((r) => includesSkillBlock(r.skillsText, skill.name));
      included.set(skill.id, withSkill);
      usage.set(skill.id, {
        agents,
        runsTotal: skillRuns.length,
        runsWithSkill: withSkill.length,
        findings: [],
      });
    }

    const runIds = [...new Set([...included.values()].flat().map((r) => r.runId))];
    const findingsByRun = new Map<string, RunFindingRow[]>();
    for (const f of await this.repo.findingsForRuns(runIds)) {
      findingsByRun.set(f.runId, [...(findingsByRun.get(f.runId) ?? []), f]);
    }
    for (const skill of skills) {
      usage.get(skill.id)!.findings = included
        .get(skill.id)!
        .flatMap((r) => findingsByRun.get(r.runId) ?? []);
    }
    return usage;
  }
}
