import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { findings } from './reviews';
import { agents } from './agents';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    name: text('name').notNull(),
    inputDiff: text('input_diff'),
    inputFiles: jsonb('input_files'),
    inputMeta: jsonb('input_meta'),
    expectedOutput: jsonb('expected_output'),
    notes: text('notes'),
    /** Finding this case was created from; SET NULL keeps the case if the finding is deleted. */
    sourceFindingId: uuid('source_finding_id').references(() => findings.id, {
      onDelete: 'set null',
    }),
    sourcePrId: uuid('source_pr_id').references(() => pullRequests.id, { onDelete: 'set null' }),
    origin: text('origin', { enum: ['finding', 'manual'] })
      .notNull()
      .default('manual'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerIdx: index('eval_cases_owner_idx').on(t.workspaceId, t.ownerKind, t.ownerId, t.createdAt),
    // NULLS DISTINCT (default): manual and orphaned cases are unaffected.
    sourceFindingUq: uniqueIndex('eval_cases_owner_finding_uq').on(
      t.ownerKind,
      t.ownerId,
      t.sourceFindingId,
    ),
    sourceFindingIdx: index('eval_cases_source_finding_idx').on(t.sourceFindingId),
    sourcePrIdx: index('eval_cases_source_pr_idx').on(t.sourcePrId),
  }),
);

/** Agent-level eval run: one execution of an agent over all of its cases, with a config snapshot. */
export const evalAgentRuns = pgTable(
  'eval_agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    agentVersion: integer('agent_version').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    strategy: text('strategy').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    skillIds: jsonb('skill_ids').$type<string[]>().notNull().default([]),
    status: text('status', { enum: ['running', 'done', 'partial', 'failed'] }).notNull(),
    reason: text('reason'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    casesTotal: integer('cases_total').notNull().default(0),
    casesExecuted: integer('cases_executed').notNull().default(0),
    casesErrored: integer('cases_errored').notNull().default(0),
    casesPassed: integer('cases_passed').notNull().default(0),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    costUsd: doublePrecision('cost_usd'),
    durationMs: integer('duration_ms'),
  },
  (t) => ({
    agentStartedIdx: index('eval_agent_runs_agent_started_idx').on(t.agentId, t.startedAt),
    wsStartedIdx: index('eval_agent_runs_ws_started_idx').on(t.workspaceId, t.startedAt),
    // DB guard: at most one active run per agent.
    activeUq: uniqueIndex('eval_agent_runs_active_uq')
      .on(t.agentId)
      .where(sql`${t.status} = 'running'`),
  }),
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => evalCases.id, { onDelete: 'cascade' }),
    /** Null for single-case runs. */
    evalAgentRunId: uuid('eval_agent_run_id').references(() => evalAgentRuns.id, {
      onDelete: 'cascade',
    }),
    status: text('status', { enum: ['running', 'passed', 'failed', 'error'] })
      .notNull()
      .default('running'),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    errorReason: text('error_reason'),
    actualOutput: jsonb('actual_output'),
    pass: boolean('pass'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
    expectedCount: integer('expected_count'),
    gotCount: integer('got_count'),
    keptCount: integer('kept_count'),
    droppedCount: integer('dropped_count'),
    mustFindTotal: integer('must_find_total'),
    mustFindMatched: integer('must_find_matched'),
    positiveFindings: integer('positive_findings'),
    negativeFindings: integer('negative_findings'),
  },
  (t) => ({
    caseRanIdx: index('eval_runs_case_ran_idx').on(t.caseId, t.ranAt),
    agentRunIdx: index('eval_runs_agent_run_idx').on(t.evalAgentRunId),
    // Single-case runs: at most one running result per case.
    caseRunningUq: uniqueIndex('eval_runs_case_running_uq')
      .on(t.caseId)
      .where(sql`${t.status} = 'running' AND ${t.evalAgentRunId} IS NULL`),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
