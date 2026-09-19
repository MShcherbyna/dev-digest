import type { Skill } from "@devdigest/shared";

/** The block inserted into the agent prompt for a skill (`### <name>` + body). */
export function buildPromptBlock(skill: Pick<Skill, "name" | "body">): string {
  return `### ${skill.name}\n\n${skill.body}`;
}
