import { pgTable, uuid, jsonb, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { agents } from './agents';
import { skills } from './skills';
import { repos } from './repos';

// ============================================================ Project context
// Per-(agent|skill, repository) ordered lists of repo-relative markdown paths
// (paths only, never text). Deliberately outside the agent/skill version
// snapshots (AC-23, AC-38). Rows go away with the agent, skill or repo (AC-39).
// Like `agent_skills`, no workspace_id: scoping is through agents/skills/repos.

export const agentRepoContext = pgTable(
  'agent_repo_context',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    paths: jsonb('paths').$type<string[]>().notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.agentId, t.repoId] }),
    repoIdx: index('agent_repo_context_repo_idx').on(t.repoId),
  }),
);

export const skillRepoContext = pgTable(
  'skill_repo_context',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    paths: jsonb('paths').$type<string[]>().notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.skillId, t.repoId] }),
    repoIdx: index('skill_repo_context_repo_idx').on(t.repoId),
  }),
);
