import { z } from 'zod';
import { RunSummary } from '@devdigest/shared';
import { RunTraceWithContext } from '../project-context/schemas.js';

/**
 * Module-local extensions of the vendored `reviews`/observability contracts
 * (SPEC-2026-10-16, Q-1): `vendor/shared` is do-not-touch, so the Multi-Agent
 * Review fields are added here via `.extend`, the same precedent as
 * `project-context/schemas.ts` `RunTraceWithContext`. Re-vendor at the sync
 * source if these are later promoted into the shared contract.
 */

/** A finding the grounding gate dropped, persisted into the run's trace (AC-32). */
export const GroundingDrop = z.object({
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  reason: z.string(),
});
export type GroundingDrop = z.infer<typeof GroundingDrop>;

/** The trace document actually persisted/served: `RunTraceWithContext` plus
 * the structured grounding-drop list (AC-31/AC-32). Omitted when empty so
 * existing single-agent traces that predate this change are unaffected. */
export const RunTraceStored = RunTraceWithContext.extend({
  grounding_dropped: z.array(GroundingDrop).optional(),
});
export type RunTraceStored = z.infer<typeof RunTraceStored>;

/** One row of `GET /pulls/:id/runs`, with the multi-run link (AC-6). Null for
 * a single-agent run; the parent `multi_agent_runs.id` for a multi-run child. */
export const RunSummaryWithParent = RunSummary.extend({
  multi_agent_run_id: z.string().nullable(),
});
export type RunSummaryWithParent = z.infer<typeof RunSummaryWithParent>;
