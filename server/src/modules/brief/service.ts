import type { BlastRadius, Intent } from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import {
  BRIEF_SCHEMA_NAME,
  DOC_WRAP_OVERHEAD_TOKENS,
  INPUT_TARGET_TOKENS,
  LOG_CAUSE_MAX_CHARS,
  MIN_DOC_TOKENS,
  OUTPUT_MAX_TOKENS,
  SPEC_DOC_BUDGET_TOKENS,
} from './constants.js';
import {
  blastCallerLines,
  groundFocus,
  groundRisks,
  hunkRanges,
  isStale,
  selectFiles,
  type Range,
} from './helpers.js';
import type { BriefDeps, BriefFile, BriefLog, BriefPull } from './ports.js';
import { assembleBriefMessages, buildFactBlocks, loadBriefSystemPrompt } from './prompt.js';
import { BriefModelOutput, StoredBrief } from './schemas.js';
import type { BriefState } from './schemas.js';

type Outcome = 'ok' | 'missing_api_key' | 'provider_error' | 'invalid_output';

interface Stats {
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  cause: string | null;
  intentAvailable: boolean;
  blastAvailable: boolean;
  specDocs: number;
  dropped: { risks: number; risk_refs: number; focus: number };
  inputTokensEstimate: number | null;
  docsBudgetTokens: number | null;
  filesSent: number | null;
  filesTotal: number | null;
  budgetTrimmed: boolean;
}

function newStats(): Stats {
  return {
    provider: null,
    model: null,
    tokensIn: null,
    tokensOut: null,
    costUsd: null,
    cause: null,
    intentAvailable: false,
    blastAvailable: false,
    specDocs: 0,
    dropped: { risks: 0, risk_refs: 0, focus: 0 },
    inputTokensEstimate: null,
    docsBudgetTokens: null,
    filesSent: null,
    filesTotal: null,
    budgetTrimmed: false,
  };
}

const errMessage = (err: unknown): string =>
  (err instanceof Error ? err.message : 'unknown error').slice(0, LOG_CAUSE_MAX_CHARS);

const GENERIC: Record<string, string> = {
  provider_error: 'Could not generate the PR brief with the configured model',
  invalid_output: 'The model returned a PR brief that could not be used',
};

function toAppError(err: unknown, stats: Stats): AppError {
  if (err instanceof AppError) return err;
  stats.cause ??= errMessage(err);
  return new AppError('provider_error', GENERIC.provider_error!, 502);
}

/** Strips the blast read model (`degraded`, `reason`, `ref_sha`) to the vendored shape. */
function toBlastRadius(b: BlastRadius): BlastRadius {
  return { changed_symbols: b.changed_symbols, downstream: b.downstream, summary: b.summary };
}

/**
 * Generates and stores the per-PR brief. A container singleton on purpose: the
 * in-flight map is the single source for `generating` and for the 409 rule.
 * Exactly one structured LLM call per generation; the model never sees code.
 */
export class BriefService {
  private inflight = new Map<string, object>();

  constructor(private deps: BriefDeps) {}

  async getState(workspaceId: string, prId: string): Promise<BriefState> {
    const pull = await this.deps.store.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const brief = await this.deps.store.getBrief(prId);
    return { brief, stale: isStale(brief, pull.headSha), generating: this.inflight.has(prId) };
  }

  async generate(workspaceId: string, prId: string, log: BriefLog): Promise<StoredBrief> {
    const pull = await this.deps.store.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    // Check-and-set with no await in between: two concurrent calls cannot both pass.
    if (this.inflight.has(prId)) {
      throw new AppError('generation_in_progress', 'A generation is already running for this pull request', 409);
    }
    const token = {};
    this.inflight.set(prId, token);

    const t0 = Date.now();
    const stats = newStats();
    let logged = false;
    const emit = (outcome: Outcome): void => {
      if (logged) return;
      logged = true;
      const line = {
        pr_id: prId,
        provider: stats.provider,
        model: stats.model,
        tokens_in: stats.tokensIn,
        tokens_out: stats.tokensOut,
        cost_usd: stats.costUsd,
        duration_ms: Date.now() - t0,
        outcome,
        intent_available: stats.intentAvailable,
        blast_available: stats.blastAvailable,
        spec_docs: stats.specDocs,
        dropped: stats.dropped,
        input_tokens_estimate: stats.inputTokensEstimate,
        docs_budget_tokens: stats.docsBudgetTokens,
        files_sent: stats.filesSent,
        files_total: stats.filesTotal,
        budget_trimmed: stats.budgetTrimmed,
      };
      if (outcome === 'ok') log.info(line, 'brief: generated');
      else log.warn({ ...line, cause: stats.cause }, 'brief: generation failed');
    };

    try {
      const work = this.run(workspaceId, pull, token, stats);
      work.catch(() => undefined); // a timed-out run may still reject later
      try {
        const brief = await withTimeout(work, this.deps.timeoutMs);
        emit('ok');
        return brief;
      } catch (err) {
        const app =
          err instanceof TimeoutError
            ? new AppError('provider_error', GENERIC.provider_error!, 502)
            : toAppError(err, stats);
        if (err instanceof TimeoutError) stats.cause ??= errMessage(err);
        emit(app.code as Outcome);
        if ((app.code === 'provider_error' || app.code === 'invalid_output') && stats.cause) {
          throw new AppError(app.code, app.message, app.statusCode, { cause: stats.cause });
        }
        throw app;
      }
    } finally {
      if (this.inflight.get(prId) === token) this.inflight.delete(prId);
    }
  }

  private async run(workspaceId: string, pull: BriefPull, token: object, stats: Stats): Promise<StoredBrief> {
    const { store, specDocs } = this.deps;

    // (a) changed files: an empty list (or a read error) cannot produce a brief.
    let files: BriefFile[];
    try {
      files = await store.listFiles(pull.id);
    } catch (err) {
      stats.cause = errMessage(err);
      throw new AppError('provider_error', GENERIC.provider_error!, 502);
    }
    if (files.length === 0) {
      stats.cause = 'pull request has no changed files';
      throw new AppError('provider_error', GENERIC.provider_error!, 502);
    }

    // (b) stored intent: never derived here.
    let intent: Intent | null = null;
    try {
      intent = await this.deps.intent.get(workspaceId, pull.id);
    } catch {
      intent = null;
    }
    stats.intentAvailable = intent !== null;

    // (c) blast: a throw or a degraded index means "unavailable".
    let blast: BlastRadius | null = null;
    try {
      const b = await this.deps.blast.get(workspaceId, pull.id);
      blast = b.degraded ? null : toBlastRadius(b);
    } catch {
      blast = null;
    }
    stats.blastAvailable = blast !== null;

    // (d)-(e) facts and their caps.
    const findings = await store.latestReviewFindings(pull.id);
    const { selected, total } = selectFiles(files, this.deps.roleOf);
    const system = await loadBriefSystemPrompt();
    const blocks = buildFactBlocks(
      { title: pull.title, body: pull.body, intent, blast, files: selected, filesTotal: total, findings },
      system,
    );

    // (f) the documents get whatever the rest leaves, up to their own cap.
    const docsBudget = Math.max(0, Math.min(SPEC_DOC_BUDGET_TOKENS, INPUT_TARGET_TOKENS - blocks.restTokens));
    stats.docsBudgetTokens = docsBudget;
    let docs: { path: string; content: string }[] = [];
    try {
      docs = (
        await specDocs.resolveForBrief({
          workspaceId,
          repoId: pull.repoId,
          clonePath: pull.clonePath,
          budgetTokens: docsBudget,
          perDocOverheadTokens: DOC_WRAP_OVERHEAD_TOKENS,
          minDocTokens: MIN_DOC_TOKENS,
        })
      ).docs;
    } catch {
      docs = [];
    }

    // (f2)
    const assembled = assembleBriefMessages(blocks, docs);
    stats.inputTokensEstimate = assembled.estimatedTokens;
    stats.budgetTrimmed = assembled.budgetTrimmed;
    stats.filesSent = assembled.filesSent;
    stats.filesTotal = total;
    stats.specDocs = assembled.docsSent.length;

    // (g)
    const choice = await this.deps.modelChoice(workspaceId);
    stats.provider = choice.provider;
    stats.model = choice.model;
    let llm;
    try {
      llm = await this.deps.llm(choice.provider);
    } catch (err) {
      if (err instanceof AppError && err.code === 'config_error') {
        stats.cause = errMessage(err);
        throw new AppError(
          'missing_api_key',
          `No API key for ${choice.provider}. Add one in Settings → API Keys.`,
          500,
        );
      }
      throw err;
    }

    // (h) exactly one structured call.
    let output: BriefModelOutput;
    let tokensIn: number | null = null;
    let tokensOut: number | null = null;
    let costUsd: number | null = null;
    try {
      const res = await llm.completeStructured<BriefModelOutput>({
        model: choice.model,
        schema: BriefModelOutput,
        schemaName: BRIEF_SCHEMA_NAME,
        messages: assembled.messages,
        temperature: 0,
        maxTokens: OUTPUT_MAX_TOKENS,
        timeoutMs: this.deps.timeoutMs,
        maxRetries: 1,
      });
      tokensIn = res.tokensIn ?? null;
      tokensOut = res.tokensOut ?? null;
      costUsd = res.costUsd ?? null;
      stats.tokensIn = tokensIn;
      stats.tokensOut = tokensOut;
      stats.costUsd = costUsd;
      const parsed = BriefModelOutput.safeParse(res.data);
      if (!parsed.success) {
        stats.cause = errMessage(parsed.error);
        throw new AppError('invalid_output', GENERIC.invalid_output!, 502);
      }
      output = parsed.data;
    } catch (err) {
      if (err instanceof AppError) throw err;
      stats.cause = errMessage(err);
      if (/schema validation|fixture failed schema/i.test(errMessage(err))) {
        throw new AppError('invalid_output', GENERIC.invalid_output!, 502);
      }
      throw new AppError('provider_error', GENERIC.provider_error!, 502);
    }

    // (i) grounding against ALL changed files and blast callers, never the model's say-so.
    const changed = new Map<string, Range[]>(files.map((f) => [f.path, hunkRanges(f.patch)]));
    const callers = blastCallerLines(blast);
    const focus = groundFocus(output.review_focus, changed, callers);
    const risks = groundRisks(output.risks, changed, callers);
    stats.dropped = { risks: risks.droppedRisks, risk_refs: risks.droppedRefs, focus: focus.dropped };

    // (j)
    const brief = StoredBrief.parse({
      intent,
      blast,
      risks: { risks: risks.kept },
      history: { history: [] },
      summary: output.summary,
      review_focus: focus.kept,
      head_sha: pull.headSha,
      generated_at: (this.deps.now?.() ?? new Date()).toISOString(),
      provider: choice.provider,
      model: choice.model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
      spec_docs: assembled.docsSent,
      truncated: assembled.filesSent < total,
      files_total: total,
      files_sent: assembled.filesSent,
    });

    // (k) the deadline may have fired while we worked: never persist a timed-out run.
    if (this.inflight.get(pull.id) !== token) return brief;
    await store.upsertBrief(pull.id, brief);
    return brief;
  }
}
