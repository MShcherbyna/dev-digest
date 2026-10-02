import { z } from 'zod';
import { BlastRadius, PrHistory } from '@devdigest/shared';

/** First five mirror repo-intel's `DegradedReason`; `no_changed_files` is blast-local. */
export const BlastReasonSchema = z.enum([
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
  'no_changed_files',
]);

/** Module-local: the vendored `BlastRadius` contract has no degradation fields (do-not-touch). */
export const BlastRadiusResponse = BlastRadius.extend({
  degraded: z.boolean(),
  reason: BlastReasonSchema.nullable(),
  /** Commit the index (and so every caller line) was built from; null when unknown. */
  ref_sha: z.string().nullable(),
});
export type BlastRadiusResponse = z.infer<typeof BlastRadiusResponse>;

/** Module-local: the vendored `PrHistory` plus whether GitHub could be consulted. */
export const PriorPrsResponse = PrHistory.extend({
  /** false = GitHub could not be consulted (no token, offline, rate limit, deadline). */
  available: z.boolean(),
});
export type PriorPrsResponse = z.infer<typeof PriorPrsResponse>;
