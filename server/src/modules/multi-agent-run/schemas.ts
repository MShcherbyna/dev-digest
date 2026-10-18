import { z } from 'zod';
import { AgentColumn, AgentColumnFinding, Conflict, ConflictTake, MultiAgentRun } from '@devdigest/shared';

/**
 * Module-local view contracts for Multi-Agent Review (SPEC-2026-10-16).
 *
 * `vendor/shared` is do-not-touch (Q-1 of the plan): rather than editing either
 * vendored copy of `@devdigest/shared`, this module extends the vendored
 * `AgentColumnFinding` / `AgentColumn` / `MultiAgentRun` shapes locally via
 * `.extend`, the same precedent as `project-context/schemas.ts`
 * `RunTraceWithContext`. If these fields are later promoted into the shared
 * contract, re-vendor at the sync source and delete the `*View` aliases here.
 *
 * `Conflict` / `ConflictTake` are re-exported unchanged: `verdict` already
 * covers "a severity, or 'ignored' when the agent did not flag it".
 */

export { Conflict, ConflictTake };

/** A finding as surfaced in a multi-agent column, with the extra fields the
 * results page needs beyond the vendored subset. */
export const AgentColumnFindingView = AgentColumnFinding.extend({
  end_line: z.number().int(),
  /** 0..1 on the wire (same scale as the vendored `Finding.confidence`); the
   * client multiplies by 100 only when rendering (`ConfidenceNum`). */
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  suggested_fix: z.string().nullable(),
  /** Set when this finding was grouped with similar findings from other
   * agents (AC-20/AC-21); null for a singleton. */
  group_id: z.string().nullable(),
});
export type AgentColumnFindingView = z.infer<typeof AgentColumnFindingView>;

/** One agent's column in the multi-agent view, including the `queued` /
 * `cancelled` states a single-agent run never has. */
export const AgentColumnView = AgentColumn.extend({
  status: z.enum(['queued', 'running', 'done', 'failed', 'cancelled']),
  findings: z.array(AgentColumnFindingView),
});
export type AgentColumnView = z.infer<typeof AgentColumnView>;

/** Aggregate status of a `MultiAgentRun`, computed from its children (Q-2). */
export const MultiRunStatus = z.enum(['running', 'partial', 'done', 'failed', 'cancelled']);
export type MultiRunStatus = z.infer<typeof MultiRunStatus>;

export const MultiAgentRunView = MultiAgentRun.extend({
  status: MultiRunStatus,
  concurrency_limit: z.number().int(),
  requested_agent_ids: z.array(z.string()),
  columns: z.array(AgentColumnView),
});
export type MultiAgentRunView = z.infer<typeof MultiAgentRunView>;

// ---------------------------------------------------------------------------
// Request / response schemas
// ---------------------------------------------------------------------------

/** Body of `POST /pulls/:id/multi-agent-run` (AC-1, AC-9: 1-8 unique ids). */
export const StartMultiAgentRunBody = z
  .object({
    agent_ids: z.array(z.string().uuid()).min(1).max(8),
  })
  .refine((body) => new Set(body.agent_ids).size === body.agent_ids.length, {
    message: 'duplicate_agent_ids',
    path: ['agent_ids'],
  });
export type StartMultiAgentRunBody = z.infer<typeof StartMultiAgentRunBody>;

export const MultiRunParams = z.object({ id: z.string().uuid() });
export type MultiRunParams = z.infer<typeof MultiRunParams>;

export const MultiRunChildParams = z.object({ id: z.string().uuid(), runId: z.string().uuid() });
export type MultiRunChildParams = z.infer<typeof MultiRunChildParams>;

/** Response of `GET /repos/:id/multi-agent/last-selection` (Q-6). */
export const LastSelectionResponse = z.object({
  agent_ids: z.array(z.string()).nullable(),
});
export type LastSelectionResponse = z.infer<typeof LastSelectionResponse>;
