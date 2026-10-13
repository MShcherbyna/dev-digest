import { z } from 'zod';
import { PrBrief, RiskSeverity } from '@devdigest/shared';

/*
 * Module-local contracts: `vendor/shared` is do-not-touch, so the generation
 * metadata lives here. The client hand-mirrors `StoredBrief` / `BriefState` in
 * `client/src/lib/hooks/brief.ts` - keep identical.
 */

export const StoredBrief = PrBrief.extend({
  head_sha: z.string(),
  generated_at: z.string(),
  provider: z.string(),
  model: z.string(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  spec_docs: z.array(z.string()),
  truncated: z.boolean(),
  files_total: z.number().int(),
  files_sent: z.number().int(),
});
export type StoredBrief = z.infer<typeof StoredBrief>;

export const BriefState = z.object({
  brief: StoredBrief.nullable(),
  stale: z.boolean(),
  generating: z.boolean(),
});
export type BriefState = z.infer<typeof BriefState>;

export const GenerateBriefResponse = z.object({ brief: StoredBrief });
export type GenerateBriefResponse = z.infer<typeof GenerateBriefResponse>;

/**
 * Schema handed to the LLM. Deliberately looser than the stored shape (no array
 * maxima, no `min(1)` on `line`, free-text `kind`) so that grounding, not the
 * schema, drops bad items (AC-8). A bad severity or a missing field fails the
 * schema and gives `invalid_output` (AC-9).
 */
export const BriefModelOutput = z.object({
  summary: z.string(),
  risks: z.array(
    z.object({
      kind: z.string(),
      title: z.string(),
      explanation: z.string(),
      severity: RiskSeverity,
      file_refs: z.array(z.string()),
    }),
  ),
  review_focus: z.array(z.object({ file: z.string(), line: z.number().int(), reason: z.string() })),
});
export type BriefModelOutput = z.infer<typeof BriefModelOutput>;
