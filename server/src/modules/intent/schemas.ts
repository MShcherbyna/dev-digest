import { z } from 'zod';
import { MAX_INTENT_CHARS, MAX_ITEM_CHARS, MAX_ITEMS } from './constants.js';

const Confidence = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof Confidence>;

const Items = z.array(z.string().min(1).max(MAX_ITEM_CHARS)).max(MAX_ITEMS);

/** What the cheap model must return. Confidence is only a claim — code caps it. */
export const IntentClassification = z.object({
  intent: z.string().min(1).max(MAX_INTENT_CHARS),
  in_scope: Items,
  out_of_scope: Items,
  risk_areas: Items,
  model_confidence: Confidence,
});
export type IntentClassification = z.infer<typeof IntentClassification>;

export const IntentSourceRef = z.object({
  kind: z.enum(['title', 'description', 'branch', 'commits', 'files', 'issue', 'doc', 'link']),
  ref: z.string(),
  status: z.enum(['used', 'unfetched', 'failed', 'truncated']),
});
export type IntentSourceRef = z.infer<typeof IntentSourceRef>;

export const PrIntentDto = z.object({
  pr_id: z.string(),
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  risk_areas: z.array(z.string()),
  confidence: Confidence,
  sources: z.array(IntentSourceRef),
  head_sha: z.string().nullable(),
  derived_at: z.string(),
  model: z.string().nullable(),
  /** Computed on read: the PR head moved since derivation, or the row predates input hashing. */
  stale: z.boolean(),
});
export type PrIntentDto = z.infer<typeof PrIntentDto>;

export const IntentResponse = z.object({ intent: PrIntentDto.nullable() });
export type IntentResponse = z.infer<typeof IntentResponse>;

export const DeriveIntentBody = z.object({
  mode: z.enum(['ifAbsent', 'regenerate']).default('ifAbsent'),
});
export type DeriveIntentBody = z.infer<typeof DeriveIntentBody>;

export const DeriveIntentResponse = z.object({
  intent: PrIntentDto,
  outcome: z.enum(['existing', 'derived', 'reused']),
});
export type DeriveIntentResponse = z.infer<typeof DeriveIntentResponse>;
