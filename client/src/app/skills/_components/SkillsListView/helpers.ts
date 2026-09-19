import type { SkillSummary } from "@devdigest/shared";

/** Case-insensitive match on name or description; blank query keeps everything. */
export function filterSkills(skills: SkillSummary[], query: string): SkillSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => `${sk.name} ${sk.description}`.toLowerCase().includes(q));
}
