import type { AgentSkillLink, SkillSummary } from "@devdigest/shared";
import type { AgentSkillLinkInput } from "@/lib/hooks/skills";

/** One row of the Skills tab. `linked` = a binding already exists server-side;
   `checked` = the per-agent enabled switch. Row order = prompt order. */
export interface SkillRow {
  id: string;
  linked: boolean;
  checked: boolean;
}

/** Linked skills first (by link order), then every remaining skill unlinked. */
export function buildRows(skills: SkillSummary[], links: AgentSkillLink[]): SkillRow[] {
  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  const linked = [...links]
    .sort((a, b) => a.order - b.order)
    .filter((l) => byId.has(l.skill_id))
    .map((l) => ({ id: l.skill_id, linked: true, checked: l.enabled }));
  const linkedIds = new Set(linked.map((r) => r.id));
  const rest = skills.filter((sk) => !linkedIds.has(sk.id)).map((sk) => ({ id: sk.id, linked: false, checked: false }));
  return [...linked, ...rest];
}

/** Move `fromId` to the position currently held by `toId`. */
export function moveRow(rows: SkillRow[], fromId: string, toId: string): SkillRow[] {
  const from = rows.findIndex((r) => r.id === fromId);
  const to = rows.findIndex((r) => r.id === toId);
  const moved = rows[from];
  if (!moved || to < 0 || from === to) return rows;
  const next = [...rows];
  next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function setChecked(rows: SkillRow[], id: string, checked: boolean): SkillRow[] {
  return rows.map((r) => (r.id === id ? { ...r, checked } : r));
}

export function countEnabled(rows: SkillRow[]): number {
  return rows.filter((r) => r.checked).length;
}

/** Payload for POST /agents/:id/skills: checked rows plus previously linked
   (now unchecked) rows, keeping prompt order in `order`. */
export function toLinks(rows: SkillRow[]): AgentSkillLinkInput[] {
  return rows
    .filter((r) => r.linked || r.checked)
    .map((r, order) => ({ skill_id: r.id, order, enabled: r.checked }));
}

/** Case-insensitive name filter. */
export function matchesFilter(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || name.toLowerCase().includes(q);
}
