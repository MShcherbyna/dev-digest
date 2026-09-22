import { z } from 'zod';
import { MAX_CONVENTIONS, MAX_RULE_LENGTH } from './constants.js';
import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from '../skills/constants.js';

/** What the model must return. `category` is a hint only — it is never stored. */
export const ConventionExtraction = z.object({
  conventions: z
    .array(
      z.object({
        category: z.string().optional(),
        rule: z.string().min(1).max(MAX_RULE_LENGTH),
        evidence: z.object({
          file: z.string().min(1),
          line: z.number().int().positive(),
          code: z.string().optional(),
        }),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(MAX_CONVENTIONS),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;

export const ConventionDto = z.object({
  id: z.string(),
  rule: z.string(),
  evidence_path: z.string(),
  evidence_snippet: z.string(),
  evidence_line: z.number().int().nullable(),
  confidence: z.number(),
  accepted: z.boolean(),
});
export type ConventionDto = z.infer<typeof ConventionDto>;

/** List/extract response: candidates + the sha the GitHub links should point at. */
export const ConventionList = z.object({
  head_sha: z.string(),
  conventions: z.array(ConventionDto),
});
export type ConventionList = z.infer<typeof ConventionList>;

export const ConventionPatch = z
  .object({
    accepted: z.boolean().optional(),
    rule: z.string().trim().min(1).max(MAX_RULE_LENGTH).optional(),
  })
  .refine((v) => v.accepted !== undefined || v.rule !== undefined, {
    message: 'Provide accepted and/or rule',
  });
export type ConventionPatch = z.infer<typeof ConventionPatch>;

export const CreateSkillBody = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).default(''),
  /** Edited skill text; when omitted the server builds it from the accepted conventions. */
  body: z.string().trim().min(1).max(100_000).optional(),
  convention_ids: z.array(z.string().uuid()).min(1),
});
export type CreateSkillBody = z.infer<typeof CreateSkillBody>;

export const ConventionIdParams = z.object({ id: z.string().uuid() });
