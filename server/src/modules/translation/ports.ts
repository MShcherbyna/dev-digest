/**
 * Application-layer ports of the translation module. Plain TS: no drizzle,
 * fastify, zod or SDK imports — repository.ts implements the store, the
 * composition root wires the rest.
 */

export type TranslationLanguage = 'uk' | 'ru';
export type LlmProviderId = 'openai' | 'anthropic' | 'openrouter';

/** The translatable text of one finding. */
export interface SourceFinding {
  id: string;
  title: string;
  rationale: string;
  suggestion: string | null;
}

/** A stored translation row. */
export interface TranslationRecord {
  findingId: string;
  language: TranslationLanguage;
  provider: string;
  model: string;
  sourceHash: string;
  title: string;
  rationale: string;
  suggestion: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  translatedAt: Date;
}

/** What the client receives for one finding. */
export interface TranslatedItem {
  findingId: string;
  title: string;
  rationale: string;
  suggestion: string | null;
}

export interface TranslateResult {
  language: TranslationLanguage;
  model: string;
  item: TranslatedItem;
  /** False when served from the DB without calling the model. */
  translated: boolean;
}

export interface TranslationStore {
  /** The finding, or `undefined` when it does not belong to the workspace. */
  findingForWorkspace(workspaceId: string, findingId: string): Promise<SourceFinding | undefined>;
  find(findingIds: string[], language: TranslationLanguage): Promise<TranslationRecord[]>;
  upsertMany(records: TranslationRecord[]): Promise<void>;
}

export interface TranslationModelChoice {
  provider: LlmProviderId;
  model: string;
}

export interface TranslationLog {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
}

export interface Translator {
  translateFinding(
    workspaceId: string,
    findingId: string,
    log: TranslationLog,
  ): Promise<TranslateResult>;
}
