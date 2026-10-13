/**
 * Application-layer ports of the brief module. Plain TS: no drizzle, fastify,
 * zod or SDK imports. Shared/schema types are type-only imports.
 */
import type { BlastRadius, Intent, LLMProvider, SmartDiffRole } from '@devdigest/shared';
import type { StoredBrief } from './schemas.js';

export type LlmProviderId = 'openai' | 'anthropic' | 'openrouter';

export interface ModelChoice {
  provider: LlmProviderId;
  model: string;
}

export interface BriefPull {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  headSha: string;
  clonePath: string | null;
}

export interface BriefFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface BriefFinding {
  file: string;
  line: number;
  severity: string;
  title: string;
}

export interface BriefStore {
  /** Workspace-scoped; `undefined` for an unknown or foreign PR. */
  getPull(workspaceId: string, prId: string): Promise<BriefPull | undefined>;
  listFiles(prId: string): Promise<BriefFile[]>;
  /** Non-dismissed findings of the latest `kind='review'` review. */
  latestReviewFindings(prId: string): Promise<BriefFinding[]>;
  /** A corrupt or legacy row reads as `null`. */
  getBrief(prId: string): Promise<StoredBrief | null>;
  upsertBrief(prId: string, brief: StoredBrief): Promise<void>;
}

/** Pure read of the stored intent; never derives. */
export interface IntentFacts {
  get(workspaceId: string, prId: string): Promise<Intent | null>;
}

export interface BlastFacts {
  get(workspaceId: string, prId: string): Promise<BlastRadius & { degraded: boolean }>;
}

export interface SpecDocsInput {
  workspaceId: string;
  repoId: string;
  clonePath: string | null;
  budgetTokens: number;
  perDocOverheadTokens: number;
  minDocTokens: number;
}

export interface SpecDocs {
  resolveForBrief(input: SpecDocsInput): Promise<{ docs: { path: string; content: string }[]; paths: string[] }>;
}

export type RoleOf = (path: string) => SmartDiffRole;

export interface BriefLog {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

export interface BriefDeps {
  store: BriefStore;
  intent: IntentFacts;
  blast: BlastFacts;
  specDocs: SpecDocs;
  roleOf: RoleOf;
  llm: (provider: LlmProviderId) => Promise<LLMProvider>;
  modelChoice: (workspaceId: string) => Promise<ModelChoice>;
  timeoutMs: number;
  now?: () => Date;
}
