import { z } from 'zod';
import { RunTrace } from '@devdigest/shared';
import { DOC_TYPES } from './constants.js';
import type * as App from './types.js';

export const SkipReason = z.enum(['missing', 'too_large', 'invalid_path', 'unreadable', 'empty']);
export type SkipReason = z.infer<typeof SkipReason>;

/** One resolved attachment in the run trace (AC-31). */
export const ProjectContextDocEntry = z.object({
  path: z.string(),
  origin: z.enum(['agent', 'skill']),
  skill: z.string().optional(),
  status: z.enum(['included', 'skipped']),
  reason: SkipReason.optional(),
  tokens: z.number().int().nonnegative().optional(),
});
export type ProjectContextDocEntry = z.infer<typeof ProjectContextDocEntry>;

/**
 * Module-local: the vendored `RunTrace` has no `project_context_docs`
 * (`vendor/shared` is do-not-touch; same precedent as `blast/schemas.ts`).
 * Omitted when a run had no attachments, so those traces are unchanged.
 */
export const RunTraceWithContext = RunTrace.extend({
  project_context_docs: z.array(ProjectContextDocEntry).optional(),
});
export type RunTraceWithContext = z.infer<typeof RunTraceWithContext>;

export const ContextFile = z.object({
  path: z.string(),
  type: z.enum(DOC_TYPES),
  size: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
  too_large: z.boolean(),
  used_by: z.number().int().nonnegative(),
});

export const ContextListing = z.object({
  glob: z.string(),
  scanned_at: z.string(),
  cloned: z.boolean(),
  truncated: z.boolean(),
  total: z.number().int().nonnegative(),
  files: z.array(ContextFile),
});
export type ContextListing = z.infer<typeof ContextListing>;

export const ContextFileQuery = z.object({ path: z.string().max(1024) });

/**
 * Required `repo_id` of the attachment routes: missing or malformed → 422
 * (shape). Unknown or foreign → 404 in the service (AC-30).
 */
export const ContextRepoQuery = z.object({ repo_id: z.string().uuid() });

export const ContextFileContent = z.object({
  path: z.string(),
  content: z.string(),
  size: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
});
export type ContextFileContent = z.infer<typeof ContextFileContent>;

/** Shape only (bad shape → 422, repo convention); path rules are 400 in the service. */
export const ContextPaths = z.object({
  paths: z.array(z.string().max(1024)).max(500),
});
export type ContextPaths = z.infer<typeof ContextPaths>;

/**
 * Compile-time contract: each Zod output must be assignable to the
 * application-layer shape in `types.ts` (which ports.ts/service.ts use), so the
 * two cannot drift.
 */
type Assignable<_T extends U, U> = true;
export type SchemaMatchesApplicationTypes = [
  Assignable<SkipReason, App.SkipReason>,
  Assignable<ProjectContextDocEntry, App.ProjectContextDocEntry>,
  Assignable<z.infer<typeof ContextFile>, App.ContextFile>,
  Assignable<ContextListing, App.ContextListing>,
  Assignable<ContextFileContent, App.ContextFileContent>,
  Assignable<ContextPaths, App.ContextPaths>,
];
