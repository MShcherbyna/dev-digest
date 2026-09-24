import type { LLMProvider } from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import {
  TRANSLATION_MAX_RETRIES,
  TRANSLATION_SCHEMA_NAME,
  TRANSLATION_TIMEOUT_MS,
} from './constants.js';
import { isReusable, sourceHash, toItem } from './helpers.js';
import { buildTranslationMessages } from './prompt.js';
import { TranslationOutput } from './schemas.js';
import type {
  LlmProviderId,
  SourceFinding,
  TranslateResult,
  TranslationLanguage,
  TranslationLog,
  TranslationModelChoice,
  TranslationRecord,
  TranslationStore,
  Translator,
} from './ports.js';

export interface TranslationServiceDeps {
  store: TranslationStore;
  llm: (provider: LlmProviderId) => Promise<LLMProvider>;
  /** Workspace choice for the `translation` feature model (else the registry default). */
  modelChoice: (workspaceId: string) => Promise<TranslationModelChoice>;
  /** Workspace `translation_language` setting (default `uk`). */
  language: (workspaceId: string) => Promise<TranslationLanguage>;
}

/**
 * Translates one finding with the selected model and caches the result per
 * (finding, language). A cached row is reused only when language, provider,
 * model and source text are all unchanged. Concurrent requests for one
 * (finding, language) share ONE promise, so this must be a container singleton.
 */
export class TranslationService implements Translator {
  private inflight = new Map<string, Promise<TranslateResult>>();

  constructor(private deps: TranslationServiceDeps) {}

  async translateFinding(
    workspaceId: string,
    findingId: string,
    log: TranslationLog,
  ): Promise<TranslateResult> {
    const language = await this.deps.language(workspaceId);
    const key = `${workspaceId}:${findingId}:${language}`;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const promise = this.run(workspaceId, findingId, language, log).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }

  private async run(
    workspaceId: string,
    findingId: string,
    language: TranslationLanguage,
    log: TranslationLog,
  ): Promise<TranslateResult> {
    const finding = await this.deps.store.findingForWorkspace(workspaceId, findingId);
    if (!finding) throw new NotFoundError('Finding not found');

    // A failing lookup just means "not reusable": translate() resolves the model
    // again and maps its own failure to 502 translation_failed.
    const choice = await this.deps.modelChoice(workspaceId).catch(() => undefined);
    const [row] = await this.deps.store.find([finding.id], language);
    if (choice && isReusable(row, finding, language, choice)) {
      log.info(`translation: finding served from the DB (${language})`, { findingId, language });
      return { language, model: row.model, item: toItem(row), translated: false };
    }

    const t0 = Date.now();
    const record = await this.translate(workspaceId, finding, language, log);
    await this.deps.store.upsertMany([record]);
    log.info(
      `translation: finding translated to ${language} with ${record.provider}/${record.model} (${Date.now() - t0}ms)`,
      { findingId, language },
    );
    return { language, model: record.model, item: toItem(record), translated: true };
  }

  private async translate(
    workspaceId: string,
    src: SourceFinding,
    language: TranslationLanguage,
    log: TranslationLog,
  ): Promise<TranslationRecord> {
    let choice: TranslationModelChoice | undefined;
    try {
      choice = await this.deps.modelChoice(workspaceId);
      const llm = await this.deps.llm(choice.provider);
      const res = await llm.completeStructured<TranslationOutput>({
        model: choice.model,
        schema: TranslationOutput,
        schemaName: TRANSLATION_SCHEMA_NAME,
        messages: buildTranslationMessages(src, language),
        temperature: 0,
        timeoutMs: TRANSLATION_TIMEOUT_MS,
        maxRetries: TRANSLATION_MAX_RETRIES,
      });
      return {
        findingId: src.id,
        language,
        provider: choice.provider,
        model: choice.model,
        sourceHash: sourceHash(src),
        title: res.data.title.trim(),
        rationale: res.data.rationale.trim(),
        suggestion:
          src.suggestion === null ? null : (res.data.suggestion?.trim() ?? src.suggestion),
        tokensIn: res.tokensIn ?? null,
        tokensOut: res.tokensOut ?? null,
        costUsd: res.costUsd ?? null,
        translatedAt: new Date(),
      };
    } catch (err) {
      // Missing key / config carries a safe, actionable message; provider and
      // output-validation failures are collapsed to a generic one for the client.
      // The cause goes to the server log only, truncated.
      log.warn(
        `translation: failed (${choice?.provider ?? '?'}/${choice?.model ?? '?'}): ${
          err instanceof Error ? err.message.slice(0, 300) : 'unknown error'
        }`,
      );
      const safe =
        err instanceof AppError && err.code === 'config_error'
          ? err.message
          : 'Could not translate the finding with the configured model';
      throw new AppError('translation_failed', safe, 502);
    }
  }
}
