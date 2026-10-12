import { z } from 'zod';

/*
 * Module-local contract: the vendored `Onboarding` in `vendor/shared` is a
 * different (unused) shape and `vendor/shared` is do-not-touch. The client
 * hand-mirrors these in `client/src/lib/hooks/onboarding.ts` - keep identical.
 */

export const NodeKind = z.enum(['entry', 'service', 'middleware', 'storage', 'external']);
export type NodeKind = z.infer<typeof NodeKind>;

export const Complexity = z.enum(['low', 'medium', 'high']);
export type Complexity = z.infer<typeof Complexity>;

export const PathKind = z.enum(['file', 'directory', 'new_file']);
export type PathKind = z.infer<typeof PathKind>;

export const IndexStatus = z.enum(['full', 'partial', 'degraded', 'failed', 'none']);
export type IndexStatus = z.infer<typeof IndexStatus>;

export const DiagramNode = z.object({ id: z.string(), label: z.string(), kind: NodeKind });
export type DiagramNode = z.infer<typeof DiagramNode>;

export const DiagramEdge = z.object({ from: z.string(), to: z.string() });
export type DiagramEdge = z.infer<typeof DiagramEdge>;

export const Diagram = z.object({ nodes: z.array(DiagramNode), edges: z.array(DiagramEdge) });
export type Diagram = z.infer<typeof Diagram>;

export const OnboardingTour = z.object({
  repo_id: z.string(),
  generated_at: z.string(),
  commit_sha: z.string(),
  files_indexed: z.number().int().nonnegative(),
  partial_index: z.boolean(),
  architecture: z.object({
    summary: z.string(),
    diagram: Diagram.nullable(),
  }),
  critical_paths: z.array(z.object({ path: z.string(), description: z.string() })),
  run_locally: z.array(z.object({ command: z.string() })),
  reading_path: z.array(z.object({ path: z.string(), reason: z.string() })),
  first_tasks: z.array(
    z.object({ title: z.string(), path: z.string(), path_kind: PathKind, complexity: Complexity }),
  ),
});
export type OnboardingTour = z.infer<typeof OnboardingTour>;

export const OnboardingState = z.object({
  cloned: z.boolean(),
  generating: z.boolean(),
  index: z.object({
    status: IndexStatus,
    last_indexed_sha: z.string().nullable(),
    files_indexed: z.number().int().nonnegative(),
  }),
  stale: z.boolean(),
  tour: OnboardingTour.nullable(),
});
export type OnboardingState = z.infer<typeof OnboardingState>;

export const GenerateResponse = z.object({ tour: OnboardingTour });
export type GenerateResponse = z.infer<typeof GenerateResponse>;

/**
 * Schema handed to the LLM. Array lengths are not bounded here (overflow is
 * trimmed by grounding code); `kind` is a plain string so an unknown kind
 * reaches the diagram check instead of failing the whole output. String
 * `max` values only exist to turn a runaway output into `invalid_output`.
 */
const Short = z.string().max(300);

export const TourModelOutput = z.object({
  architecture: z.object({
    summary: z.string().min(1).max(4000),
    nodes: z.array(z.object({ id: Short, label: Short, kind: Short })),
    edges: z.array(z.object({ from: Short, to: Short })),
  }),
  critical_paths: z.array(z.object({ path: Short, description: Short })),
  run_locally: z.array(z.object({ command: Short })),
  reading_path: z.array(z.object({ path: Short, reason: Short })),
  first_tasks: z.array(z.object({ title: Short, path: Short, complexity: Complexity })),
});
export type TourModelOutput = z.infer<typeof TourModelOutput>;
