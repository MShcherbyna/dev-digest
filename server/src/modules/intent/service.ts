import type { LLMProvider } from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import {
  CLASSIFICATION_SCHEMA_NAME,
  INTENT_MAX_RETRIES,
  INTENT_TIMEOUT_MS,
} from './constants.js';
import { evidenceCap, finalConfidence, inputHash, isStale, toPromptIntent } from './helpers.js';
import { buildClassificationMessages } from './prompt.js';
import { IntentClassification } from './schemas.js';
import type {
  DeriveMode,
  DeriveResult,
  GatheredSources,
  IntentDeriver,
  IntentLog,
  IntentPull,
  IntentPullReader,
  IntentPullWithRepo,
  IntentRecord,
  IntentRepoRef,
  IntentSourcesPort,
  IntentStore,
  IntentTrigger,
  PrIntent,
  RunIntentOrigin,
} from './ports.js';

export interface IntentServiceDeps {
  store: IntentStore;
  sources: IntentSourcesPort;
  pulls: IntentPullReader;
  llm: (provider: 'openai' | 'anthropic' | 'openrouter') => Promise<LLMProvider>;
  /** Workspace override for `review_intent`, else the cheap default. */
  modelChoice: (
    workspaceId: string,
  ) => Promise<{ provider: 'openai' | 'anthropic' | 'openrouter'; model: string }>;
}

/**
 * Intent layer: works out what a PR is for. Generation is lazy and bounded:
 *  - `ifAbsent` (first PR-page visit / review run) never overwrites a row;
 *  - `regenerate` (button) reuses the stored result when the inputs are unchanged;
 *  - concurrent derivations for one PR share ONE promise (`inflight`), so this
 *    service must be a singleton per container;
 *  - the DB primary key (`insertIfAbsent`) settles any cross-process race.
 * The run path (`intentForRun`) never throws — a failed classifier means the
 * review simply runs without intent.
 */
export class IntentService implements IntentDeriver {
  private inflight = new Map<string, Promise<DeriveResult>>();

  constructor(private deps: IntentServiceDeps) {}

  async get(workspaceId: string, prId: string): Promise<PrIntent | null> {
    const found = await this.requirePull(workspaceId, prId);
    const stored = await this.deps.store.get(prId);
    return stored ? withStale(stored, found.pull.headSha) : null;
  }

  async derive(
    workspaceId: string,
    prId: string,
    mode: DeriveMode,
    log: IntentLog,
  ): Promise<DeriveResult> {
    const found = await this.requirePull(workspaceId, prId);
    const trigger: IntentTrigger = mode === 'ifAbsent' ? 'page_visit' : 'regenerate';
    const t0 = Date.now();
    try {
      const result = await this.deriveShared(workspaceId, found, mode, trigger, log);
      const i = result.intent;
      const derived = result.outcome === 'derived';
      const line = `intent derive: ${trigger} → ${result.outcome}${result.outcome === 'reused' ? ' (inputs unchanged)' : ''}`;
      // The no-op page-visit read (row already exists) is debug noise, not an event.
      const fields = {
        prId,
        mode,
        outcome: result.outcome,
        trigger,
        ms: Date.now() - t0,
        model: i.model,
        tokensIn: derived ? i.tokensIn : null,
        tokensOut: derived ? i.tokensOut : null,
        costUsd: derived ? i.costUsd : null,
      };
      if (result.outcome === 'existing') log.tool(line, fields);
      else log.info(line, fields);
      return result;
    } catch (err) {
      log.warn('intent derive failed', { prId, mode, trigger, err: (err as Error).message });
      throw err;
    }
  }

  async intentForRun(
    args: { workspaceId: string; pull: IntentPull; repo: IntentRepoRef; changedPaths?: string[] },
    log: IntentLog,
  ): Promise<{ intent: PrIntent; origin: RunIntentOrigin } | undefined> {
    const { workspaceId, pull, repo } = args;
    try {
      const stored = await this.deps.store.get(pull.id);
      if (stored) {
        const intent = withStale(stored, pull.headSha);
        log.info(
          intent.stale
            ? 'intent: using stored intent — stale (head moved since derivation); regenerate from the PR page'
            : `intent: using stored intent (derived ${stored.derivedAt.toISOString()}, confidence=${stored.confidence})`,
        );
        return { intent, origin: intent.stale ? 'stored-stale' : 'stored' };
      }
      log.info('intent: none stored — deriving now');
      const result = await this.deriveShared(
        workspaceId,
        { pull, repo },
        'ifAbsent',
        'review_run',
        log,
        args.changedPaths,
      );
      return { intent: result.intent, origin: result.outcome === 'existing' ? 'stored' : 'derived' };
    } catch (err) {
      // info, never error: an `error` run event would raise a toast in the studio.
      log.warn(`intent: classifier failed — ${(err as Error).message} — continuing without intent`);
      return undefined;
    }
  }

  toPromptIntent(intent: PrIntent) {
    return toPromptIntent(intent);
  }

  // ---------------------------------------------------------------- internals

  private async requirePull(workspaceId: string, prId: string): Promise<IntentPullWithRepo> {
    const found = await this.deps.pulls.getPullWithRepo(workspaceId, prId);
    if (!found) throw new NotFoundError('Pull request not found');
    return found;
  }

  /** `ifAbsent` short-circuits on an existing row; every derivation goes through the in-flight map. */
  private async deriveShared(
    workspaceId: string,
    found: IntentPullWithRepo,
    mode: DeriveMode,
    trigger: IntentTrigger,
    log: IntentLog,
    changedPaths?: string[],
  ): Promise<DeriveResult> {
    const { pull } = found;
    if (mode === 'ifAbsent') {
      const stored = await this.deps.store.get(pull.id);
      if (stored) return { intent: withStale(stored, pull.headSha), outcome: 'existing' };
    }
    const pending = this.inflight.get(pull.id);
    if (pending) {
      log.info(
        trigger === 'review_run'
          ? 'intent: joined in-flight derivation (started by page visit)'
          : 'intent derive: joined in-flight',
      );
      return pending;
    }
    const promise = this.doDerive(workspaceId, found, mode, trigger, log, changedPaths).finally(() => {
      this.inflight.delete(pull.id);
    });
    this.inflight.set(pull.id, promise);
    return promise;
  }

  private async doDerive(
    workspaceId: string,
    found: IntentPullWithRepo,
    mode: DeriveMode,
    trigger: IntentTrigger,
    log: IntentLog,
    changedPaths?: string[],
  ): Promise<DeriveResult> {
    const { pull, repo } = found;
    const sources = await this.deps.sources.gather({
      pull,
      repo,
      fresh: trigger !== 'review_run',
      ...(changedPaths ? { changedPaths } : {}),
    });
    log.info(`intent: sources — ${describeSources(sources)}`);
    const hash = inputHash(sources);

    if (mode === 'regenerate') {
      const stored = await this.deps.store.get(pull.id);
      // Reuse only when the same model would answer: after the workspace picks
      // another model in Settings, Regenerate must call it (rows written before
      // provider/model were stored have nulls and are re-derived once).
      // A failing lookup just means "not reusable": classify() resolves the model
      // again and maps its own failure to 502 intent_failed.
      const choice = stored
        ? await this.deps.modelChoice(workspaceId).catch(() => undefined)
        : undefined;
      if (
        stored &&
        choice &&
        stored.inputHash === hash &&
        stored.provider === choice.provider &&
        stored.model === choice.model
      ) {
        // Same inputs and model → same answer: skip the model. If only the head
        // moved, re-anchor the row to the new head (derived_at is unchanged).
        const kept =
          stored.headSha === pull.headSha
            ? stored
            : await this.deps.store.upsert({ ...stored, headSha: pull.headSha });
        return { intent: withStale(kept, pull.headSha), outcome: 'reused' };
      }
    }

    const record = await this.classify(workspaceId, pull, sources, hash, trigger, log);
    if (mode === 'regenerate') {
      await this.deps.store.upsert(record);
      return { intent: withStale(record, pull.headSha), outcome: 'derived' };
    }
    const stored = await this.deps.store.insertIfAbsent(record);
    const won = stored.derivedAt.getTime() === record.derivedAt.getTime();
    return { intent: withStale(stored, pull.headSha), outcome: won ? 'derived' : 'existing' };
  }

  private async classify(
    workspaceId: string,
    pull: IntentPull,
    sources: GatheredSources,
    hash: string,
    trigger: IntentTrigger,
    log: IntentLog,
  ): Promise<IntentRecord> {
    const t0 = Date.now();
    let choice: Awaited<ReturnType<IntentServiceDeps['modelChoice']>>;
    let res: Awaited<ReturnType<LLMProvider['completeStructured']>> & { data: IntentClassification };
    try {
      choice = await this.deps.modelChoice(workspaceId);
      const llm = await this.deps.llm(choice.provider);
      res = await llm.completeStructured<IntentClassification>({
        model: choice.model,
        schema: IntentClassification,
        schemaName: CLASSIFICATION_SCHEMA_NAME,
        messages: buildClassificationMessages(sources),
        temperature: 0,
        timeoutMs: INTENT_TIMEOUT_MS,
        maxRetries: INTENT_MAX_RETRIES,
      });
    } catch (err) {
      // Config errors (missing key) carry a safe, actionable message; anything else stays generic.
      // Missing key / config carries a safe, actionable message; provider and
      // output-validation failures are collapsed to a generic one (no secrets, no bodies).
      const safe =
        err instanceof AppError && err.code === 'config_error'
          ? err.message
          : 'Could not derive intent from the configured model';
      throw new AppError('intent_failed', safe, 502);
    }

    const d = res.data;
    const confidence = finalConfidence(d.model_confidence, evidenceCap(sources));
    log.tool(
      `intent: derived with ${choice.provider}/${choice.model} (confidence=${confidence}, ${Date.now() - t0}ms, tokens ${res.tokensIn}/${res.tokensOut}, $${res.costUsd ?? 'n/a'})`,
    );
    return {
      prId: pull.id,
      intent: d.intent.trim(),
      inScope: d.in_scope.map((s) => s.trim()),
      outOfScope: d.out_of_scope.map((s) => s.trim()),
      riskAreas: d.risk_areas.map((s) => s.trim()),
      confidence,
      sources: sources.refs,
      headSha: pull.headSha,
      inputHash: hash,
      trigger,
      provider: choice.provider,
      model: choice.model,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      costUsd: res.costUsd,
      derivedAt: new Date(),
    };
  }
}

function withStale(record: IntentRecord, headSha: string): PrIntent {
  return { ...record, stale: isStale(record, headSha) };
}

/** Refs and counts only — never content. */
function describeSources(s: GatheredSources): string {
  const parts: string[] = [];
  if (s.refs.some((r) => r.kind === 'description')) parts.push('description');
  if (s.issue) parts.push(`issue #${s.issue.number}`);
  for (const d of s.docs) parts.push(`doc ${d.path}`);
  const unfetched = s.refs.filter((r) => r.status === 'unfetched').length;
  const failed = s.refs.filter((r) => r.status === 'failed').length;
  if (unfetched > 0) parts.push(`${unfetched} link(s) not fetched`);
  if (failed > 0) parts.push(`${failed} doc(s) failed`);
  return parts.length > 0 ? parts.join(', ') : 'title and indirect signals only';
}
