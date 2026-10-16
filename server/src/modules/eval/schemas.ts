import { z } from 'zod';

/**
 * Part-1 eval contracts. Module-local on purpose: the vendored `EvalRun`/`EvalCase`
 * contracts are do-not-touch and have no nullable metrics. The client mirrors
 * these shapes by hand in `client/src/lib/hooks/eval.ts`.
 */

const SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'] as const;

/** Relative, forward-looking repo path: no absolute path, no `..` segment, no Windows drive. */
function isSafeCasePath(p: string): boolean {
  if (p.startsWith('/') || p.startsWith('\\')) return false;
  if (/^[A-Za-z]:/.test(p)) return false;
  return !p.split(/[\\/]/).includes('..');
}

export const ExpectedItem = z
  .object({
    expect: z.enum(['must_find', 'must_not_flag']).default('must_find'),
    file: z
      .string()
      .min(1)
      .max(1000)
      .refine(isSafeCasePath, { message: 'file must be a relative path inside the repo' }),
    start_line: z.number().int().min(1),
    end_line: z.number().int().min(1).optional(),
    severity: z.enum(SEVERITIES).optional(),
    category: z.string().max(64).optional(),
    title: z.string().max(300).optional(),
  })
  .strict()
  .refine((i) => i.end_line === undefined || i.end_line >= i.start_line, {
    message: 'end_line must be >= start_line',
    path: ['end_line'],
  });
export type ExpectedItem = z.infer<typeof ExpectedItem>;

export const ExpectedOutput = z.array(ExpectedItem).max(200);
export type ExpectedOutput = z.infer<typeof ExpectedOutput>;

export const CaseMeta = z.object({
  title: z.string().max(500),
  body: z.string().max(20000),
});
export type CaseMeta = z.infer<typeof CaseMeta>;

/** POST/PUT body. The diff length cap is enforced by the service so the code is `diff_too_large`. */
export const EvalCaseBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    input_diff: z.string().min(1),
    input_meta: CaseMeta,
    expected_output: ExpectedOutput,
    notes: z.string().max(2000).nullish(),
  })
  .strict();
export type EvalCaseBody = z.infer<typeof EvalCaseBody>;

/** POST /findings/:id/eval-case body: lets the confirm-before-save modal rename the draft case or
 *  tweak its expectations before it's persisted. `input_diff`/`input_meta` always come from the
 *  finding's own stored diff, never from the client. */
export const EvalCaseFindingOverride = z
  .object({
    name: EvalCaseBody.shape.name.optional(),
    expected_output: ExpectedOutput.optional(),
  })
  .strict();
export type EvalCaseFindingOverride = z.infer<typeof EvalCaseFindingOverride>;

export const EvalCaseStatus = z.enum(['running', 'passed', 'failed', 'error']);
export type EvalCaseStatus = z.infer<typeof EvalCaseStatus>;

export const EvalCaseResult = z.object({
  id: z.string(),
  case_id: z.string(),
  eval_run_id: z.string().nullable(),
  status: EvalCaseStatus,
  ran_at: z.string(),
  finished_at: z.string().nullable(),
  expected_count: z.number().int().nullable(),
  got_count: z.number().int().nullable(),
  kept_count: z.number().int().nullable(),
  dropped_count: z.number().int().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  error_reason: z.string().nullable(),
});
export type EvalCaseResult = z.infer<typeof EvalCaseResult>;

export const EvalCaseOrigin = z.enum(['finding', 'manual']);
export type EvalCaseOrigin = z.infer<typeof EvalCaseOrigin>;

export const EvalCaseSummary = z.object({
  id: z.string(),
  agent_id: z.string(),
  name: z.string(),
  origin: EvalCaseOrigin,
  input_meta: CaseMeta,
  expected_output: ExpectedOutput,
  notes: z.string().nullable(),
  source_finding_id: z.string().nullable(),
  source_pr_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  latest_result: EvalCaseResult.nullable(),
});
export type EvalCaseSummary = z.infer<typeof EvalCaseSummary>;

export const EvalCase = EvalCaseSummary.extend({ input_diff: z.string() });
export type EvalCase = z.infer<typeof EvalCase>;

export const EvalAgentRunStatus = z.enum(['running', 'done', 'partial', 'failed']);
export type EvalAgentRunStatus = z.infer<typeof EvalAgentRunStatus>;

export const EvalAgentRun = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_version: z.number().int(),
  provider: z.string(),
  model: z.string(),
  strategy: z.string(),
  skill_ids: z.array(z.string()),
  status: EvalAgentRunStatus,
  reason: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  cases_total: z.number().int(),
  cases_executed: z.number().int(),
  cases_errored: z.number().int(),
  cases_passed: z.number().int(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
});
export type EvalAgentRun = z.infer<typeof EvalAgentRun>;

export const EvalAgentRunDetail = EvalAgentRun.extend({ system_prompt: z.string() });
export type EvalAgentRunDetail = z.infer<typeof EvalAgentRunDetail>;

export const EvalRunDetailResponse = z.object({
  run: EvalAgentRunDetail,
  progress: z.object({ done: z.number().int(), total: z.number().int() }),
  cases: z.array(EvalCaseResult.extend({ case_name: z.string().nullable() })),
});
export type EvalRunDetailResponse = z.infer<typeof EvalRunDetailResponse>;

export const StartCaseRunResponse = z.object({ result_id: z.string() });
export type StartCaseRunResponse = z.infer<typeof StartCaseRunResponse>;

export const StartAgentRunResponse = z.object({
  eval_run_id: z.string(),
  status: z.literal('running'),
  cases_total: z.number().int(),
});
export type StartAgentRunResponse = z.infer<typeof StartAgentRunResponse>;

export const AgentIdParams = z.object({ id: z.string().uuid() });

export const ListRunsQuery = z.object({ since: z.string().datetime().optional() });
export type ListRunsQuery = z.infer<typeof ListRunsQuery>;

export const OkResponse = z.object({ ok: z.literal(true) });

/* ------------------------------------------------------------------ */
/* Part 2: dashboard, compare, promote, run-all                        */
/* ------------------------------------------------------------------ */

export const EvalMetric = z.enum(['recall', 'precision', 'citation_accuracy']);
export type EvalMetric = z.infer<typeof EvalMetric>;

const Fraction = z.number().nullable();

export const MetricTriple = z.object({
  recall: Fraction,
  precision: Fraction,
  citation_accuracy: Fraction,
});
export type MetricTriple = z.infer<typeof MetricTriple>;

export const RangeQuery = z.object({
  range: z.enum(['7d', '30d', '90d', 'all']).default('30d'),
});
export type RangeQuery = z.infer<typeof RangeQuery>;

export const CompareQuery = z.object({ a: z.string().uuid(), b: z.string().uuid() });
export type CompareQuery = z.infer<typeof CompareQuery>;

/** GET /eval/dashboard */
export const AgentEvalCard = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  model: z.string(),
  enabled: z.boolean(),
  cases_total: z.number().int(),
  has_running_run: z.boolean(),
  /** Latest finished run (`done|partial`). */
  last_run: z
    .object({
      id: z.string(),
      agent_version: z.number().int(),
      started_at: z.string(),
      cases_passed: z.number().int(),
      cases_executed: z.number().int(),
    })
    .nullable(),
  /** <= 10 latest finished recall values, chronological, nulls dropped. */
  recall_trend: z.array(z.number()),
  latest: MetricTriple,
});
export type AgentEvalCard = z.infer<typeof AgentEvalCard>;

export const RecentEvalRun = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  agent_version: z.number().int(),
  started_at: z.string(),
  recall: Fraction,
  precision: Fraction,
  citation_accuracy: Fraction,
  cases_passed: z.number().int(),
  cases_executed: z.number().int(),
});
export type RecentEvalRun = z.infer<typeof RecentEvalRun>;

export const EvalDashboardResponse = z.object({
  agents: z.array(AgentEvalCard),
  recent_runs: z.array(RecentEvalRun),
});
export type EvalDashboardResponse = z.infer<typeof EvalDashboardResponse>;

/** GET /agents/:id/eval-dashboard */
export const AgentDashboardCurrent = z.object({
  run_id: z.string(),
  agent_version: z.number().int(),
  recall: Fraction,
  precision: Fraction,
  citation_accuracy: Fraction,
  cases_passed: z.number().int(),
  cases_executed: z.number().int(),
  cost_usd: z.number().nullable(),
});
export type AgentDashboardCurrent = z.infer<typeof AgentDashboardCurrent>;

export const TrendPoint = z.object({
  run_id: z.string(),
  started_at: z.string(),
  recall: Fraction,
  precision: Fraction,
  citation_accuracy: Fraction,
});
export type TrendPoint = z.infer<typeof TrendPoint>;

export const RegressionAlert = z.object({
  version: z.number().int(),
  /** `points` = whole points, rounded (>= 1). */
  dropped: z.array(z.object({ metric: EvalMetric, points: z.number().int() })),
  rose: z.array(EvalMetric),
  held: z.array(EvalMetric),
});
export type RegressionAlert = z.infer<typeof RegressionAlert>;

export const AgentEvalDashboardResponse = z.object({
  agent: z.object({
    id: z.string(),
    name: z.string(),
    provider: z.string(),
    model: z.string(),
    version: z.number().int(),
    enabled: z.boolean(),
  }),
  cases_total: z.number().int(),
  runs_in_range: z.number().int(),
  current: AgentDashboardCurrent.nullable(),
  /** Fractions (current - previous); `null` when < 2 finished runs, per-metric null if either side null. */
  delta: MetricTriple.nullable(),
  trend: z.array(TrendPoint),
  runs: z.array(EvalAgentRun),
  alert: RegressionAlert.nullable(),
});
export type AgentEvalDashboardResponse = z.infer<typeof AgentEvalDashboardResponse>;

/** GET /eval-runs/compare */
export const CompareSide = z.object({
  id: z.string(),
  agent_version: z.number().int(),
  started_at: z.string(),
  recall: Fraction,
  precision: Fraction,
  citation_accuracy: Fraction,
  cost_usd: z.number().nullable(),
  is_current_config: z.boolean(),
  version_available: z.boolean(),
});
export type CompareSide = z.infer<typeof CompareSide>;

export const CompareResponse = z.object({
  a: CompareSide,
  b: CompareSide,
  deltas: z.object({
    recall: Fraction,
    precision: Fraction,
    citation_accuracy: Fraction,
    cost_usd: z.number().nullable(),
  }),
  prompt_a: z.string(),
  prompt_b: z.string(),
  cases_total: z.number().int(),
});
export type CompareResponse = z.infer<typeof CompareResponse>;

/** POST /eval-runs/all */
export const RunAllSkipReason = z.enum(['no_cases', 'already_running', 'disabled', 'error']);
export type RunAllSkipReason = z.infer<typeof RunAllSkipReason>;

export const RunAllResponse = z.object({
  started: z.array(z.object({ agent_id: z.string(), eval_run_id: z.string() })),
  skipped: z.array(z.object({ agent_id: z.string(), reason: RunAllSkipReason })),
});
export type RunAllResponse = z.infer<typeof RunAllResponse>;
