/**
 * Minimal anti-corruption schemas for the DevDigest HTTP API responses this
 * package actually reads. Zod strips unknown keys by default, so `system_prompt`
 * and everything else we do not name never enters the MCP process' types.
 */
import { z } from 'zod';

export const ApiAgent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  provider: z.string(),
  model: z.string(),
  enabled: z.boolean(),
});
export type ApiAgentRecord = z.infer<typeof ApiAgent>;

export const ApiRepo = z.object({
  id: z.string(),
  owner: z.string(),
  name: z.string(),
  full_name: z.string(),
});
export type ApiRepoRecord = z.infer<typeof ApiRepo>;

export const ApiPrMeta = z.object({
  id: z.string().nullish(),
  number: z.number().int(),
  title: z.string(),
});

export const ApiRunSummary = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  status: z.string().nullable(),
  error: z.string().nullable(),
  score: z.number().nullable(),
  ran_at: z.string().nullable(),
});
export type ApiRunRecord = z.infer<typeof ApiRunSummary>;

export const ApiActiveRun = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
});
export type ApiActiveRunRecord = z.infer<typeof ApiActiveRun>;

export const ApiFinding = z.object({
  id: z.string(),
  severity: z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']),
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  rationale: z.string().default(''),
  suggestion: z.string().nullish(),
  confidence: z.number(),
});
export type ApiFindingRecord = z.infer<typeof ApiFinding>;

export const ApiReview = z.object({
  id: z.string(),
  run_id: z.string().nullable(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  kind: z.string().optional(),
  verdict: z.string().nullable(),
  summary: z.string().nullable(),
  score: z.number().nullable(),
  created_at: z.string().optional(),
  findings: z.array(ApiFinding),
});
export type ApiReviewRecord = z.infer<typeof ApiReview>;

export const ApiConvention = z.object({
  id: z.string(),
  rule: z.string(),
  evidence_path: z.string(),
  evidence_snippet: z.string().default(''),
  evidence_line: z.number().int().nullable(),
  confidence: z.number(),
  accepted: z.boolean(),
});
export type ApiConventionRecord = z.infer<typeof ApiConvention>;

export const ApiConventionList = z.object({
  head_sha: z.string(),
  conventions: z.array(ApiConvention),
});

/**
 * Mirrors the server's module-local `BlastRadiusResponse` (server/src/modules/blast/schemas.ts):
 * the vendored `BlastRadius` plus `degraded` / `reason` / `ref_sha`. Kept in sync BY HAND — this
 * package never imports server code. `reason` is a plain string (not the server's enum) so a new
 * reason added server-side does not make every call fail the safeParse.
 */
export const ApiBlastRadius = z.object({
  changed_symbols: z.array(z.object({ name: z.string(), file: z.string(), kind: z.string() })),
  downstream: z.array(
    z.object({
      symbol: z.string(),
      callers: z.array(z.object({ name: z.string(), file: z.string(), line: z.number().int() })),
      endpoints_affected: z.array(z.string()),
      crons_affected: z.array(z.string()),
    }),
  ),
  summary: z.string(),
  degraded: z.boolean(),
  reason: z.string().nullable(),
  ref_sha: z.string().nullable(),
});
export type ApiBlastRadiusRecord = z.infer<typeof ApiBlastRadius>;

export const ApiStartedReview = z.object({
  runs: z.array(z.object({ run_id: z.string(), agent_id: z.string() })),
});

export const ApiErrorEnvelope = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
