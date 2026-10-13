import {
  pgTable,
  uuid,
  jsonb,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  primaryKey,
  index,
  unique,
} from 'drizzle-orm/pg-core';
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

// ============================================================ Project context index
// Persisted index of a repository's discovered markdown docs: one state row
// per repo, a file manifest, and heading-based chunks with SHA-256 hashes.
// Rebuilt in full by the `project_context_index` job. `indexing` is in-memory
// only (never persisted): `status` is the last FINISHED outcome; no row = none.

export const contextIndexState = pgTable('context_index_state', {
  repoId: uuid('repo_id')
    .primaryKey()
    .references(() => repos.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['ready', 'failed'] }).notNull(),
  indexedAt: timestamp('indexed_at', { withTimezone: true }),
  indexedSha: text('indexed_sha'),
  glob: text('glob'),
  files: integer('files').notNull().default(0),
  chunks: integer('chunks').notNull().default(0),
  truncated: boolean('truncated').notNull().default(false),
  total: integer('total').notNull().default(0),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  failureReason: text('failure_reason', {
    enum: ['timeout', 'clone_missing', 'internal_error'],
  }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const contextFiles = pgTable(
  'context_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    type: text('type').notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    tokens: integer('tokens').notNull(),
    // null for too_large and I/O-unreadable files (content never read).
    contentHash: text('content_hash'),
    tooLarge: boolean('too_large').notNull().default(false),
    unreadable: boolean('unreadable').notNull().default(false),
    empty: boolean('empty').notNull().default(false),
  },
  (t) => ({
    repoPathUq: unique('context_files_repo_path_uq').on(t.repoId, t.path),
  }),
);

export const contextChunks = pgTable(
  'context_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => contextFiles.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    breadcrumb: jsonb('breadcrumb').$type<string[]>().notNull().default([]),
    startOffset: integer('start_offset').notNull(),
    endOffset: integer('end_offset').notNull(),
    tokens: integer('tokens').notNull(),
    text: text('text').notNull(),
    contentHash: text('content_hash').notNull(),
  },
  (t) => ({
    fileOrdinalUq: unique('context_chunks_file_ordinal_uq').on(t.fileId, t.ordinal),
    repoIdx: index('context_chunks_repo_idx').on(t.repoId),
  }),
);
