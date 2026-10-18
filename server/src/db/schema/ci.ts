import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  doublePrecision,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './core';
import { agents } from './agents';
import { agentRuns } from './runs';

export const ciInstallations = pgTable(
  'ci_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repo: text('repo').notNull(),
    targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
    /** Slug of the manifest file name (`.devdigest/agents/<slug>.yaml`). */
    agentSlug: text('agent_slug').notNull(),
    /** "pr" = installed through a devdigest/ci PR; "manual" = zip download. */
    mode: text('mode', { enum: ['pr', 'manual'] }).notNull().default('pr'),
    /** The agent's version at export time; status is derived against agents.version. */
    manifestVersion: integer('manifest_version').notNull().default(1),
    postAs: text('post_as', { enum: ['github_review', 'pr_comment', 'none'] })
      .notNull()
      .default('github_review'),
    triggers: text('triggers')
      .array()
      .notNull()
      .default(sql`'{opened,synchronize}'::text[]`),
    /** Slugs of the skill files written for this installation (for removal). */
    skillSlugs: text('skill_slugs')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    prUrl: text('pr_url'),
    removalPrUrl: text('removal_pr_url'),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    lastRunStatus: text('last_run_status'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    agentRepoUq: uniqueIndex('ci_installations_agent_repo_uq').on(t.agentId, t.repo),
    repoIdx: index('ci_installations_repo_idx').on(t.repo),
  }),
);

export const ciRuns = pgTable(
  'ci_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
      onDelete: 'set null',
    }),
    prNumber: integer('pr_number'),
    ranAt: timestamp('ran_at', { withTimezone: true }),
    status: text('status'),
    findingsCount: integer('findings_count'),
    costUsd: doublePrecision('cost_usd'),
    /** The GitHub Actions job/run URL (https://github.com/ only). */
    githubUrl: text('github_url'),
    source: text('source'),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    agentName: text('agent_name'),
    agentSlug: text('agent_slug'),
    repo: text('repo'),
    prTitle: text('pr_title'),
    verdict: text('verdict'),
    critical: integer('critical'),
    warning: integer('warning'),
    suggestion: integer('suggestion'),
    blockers: integer('blockers'),
    durationMs: integer('duration_ms'),
    githubRunId: bigint('github_run_id', { mode: 'number' }),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
  },
  (t) => ({
    runSlugUq: uniqueIndex('ci_runs_run_slug_uq').on(t.githubRunId, t.agentSlug),
    wsRanIdx: index('ci_runs_ws_ran_idx').on(t.workspaceId, sql`${t.ranAt} desc`),
    installationIdx: index('ci_runs_installation_idx').on(t.ciInstallationId),
  }),
);
