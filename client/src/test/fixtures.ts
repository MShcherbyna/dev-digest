import type { Skill, SkillSummary } from "@devdigest/shared";

/** Skill fixtures shared by the Skills UI tests. */
export const SKILL: Skill = {
  id: "sk1",
  name: "uncovered-branches",
  description: "Flag new branches no test exercises",
  type: "rubric",
  source: "manual",
  body: "# Rule\nEvery new branch needs a test.",
  enabled: true,
  version: 3,
};

export const SUMMARY: SkillSummary = {
  ...SKILL,
  tokens: 10,
  agents_count: 2,
  pull_pct: 80,
  accept_pct: 55,
};

export const SUMMARY_2: SkillSummary = {
  ...SUMMARY,
  id: "sk2",
  name: "flaky-test-detector",
  description: "Warn about time-dependent tests",
  type: "security",
  source: "imported_url",
  enabled: false,
  agents_count: 0,
  pull_pct: null,
  accept_pct: null,
};
