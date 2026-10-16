import { AgentVersionConfig } from '@devdigest/shared';
import type {
  AuthProvider,
  SecretsProvider,
  GitHubClient,
  GitClient,
  CodeIndex,
  Embedder,
  LLMProvider,
} from '@devdigest/shared';
import type { AppConfig } from './config.js';
import type { Db } from '../db/client.js';
import { JobRunner } from './jobs.js';
import { runBus, type RunBus } from './sse.js';
import { LocalSecretsProvider } from '../adapters/secrets/local.js';
import { LocalNoAuthProvider } from '../adapters/auth/local.js';
import { OctokitGitHubClient } from '../adapters/github/octokit.js';
import { SimpleGitClient } from '../adapters/git/simple-git.js';
import { RipgrepCodeIndex } from '../adapters/codeindex/ripgrep.js';
import { OpenAIProvider } from '../adapters/llm/openai.js';
import { AnthropicProvider } from '../adapters/llm/anthropic.js';
import { OpenAIEmbedder } from '../adapters/embedder/openai.js';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import { estimateCost } from '../adapters/llm/pricing.js';
import { PriceBook } from './price-book.js';
import { ConfigError } from './errors.js';
import { AgentsRepository } from '../modules/agents/repository.js';
import { ReviewRepository } from '../modules/reviews/repository.js';
import type { RepoIntel } from '../modules/repo-intel/types.js';
import { RepoIntelService } from '../modules/repo-intel/service.js';
import { type DepGraph, DepCruiseGraph } from '../adapters/depgraph/index.js';
import { type Tokenizer, TiktokenTokenizer } from '../adapters/tokenizer/index.js';
import type { IntentDeriver } from '../modules/intent/ports.js';
import { IntentRepository } from '../modules/intent/repository.js';
import { IntentService } from '../modules/intent/service.js';
import { GitHubIntentSources } from '../modules/intent/sources.js';
import { DEFAULT_INTENT_MODEL, DEFAULT_INTENT_PROVIDER } from '../modules/intent/constants.js';
import {
  getFeatureModelOverride,
  resolveFeatureModel,
  resolveTranslationLanguage,
} from '../modules/settings/feature-models.js';
import type { Translator } from '../modules/translation/ports.js';
import { TranslationRepository } from '../modules/translation/repository.js';
import { TranslationService } from '../modules/translation/service.js';
import type { BlastHistoryReader, BlastReader, PriorPrSource } from '../modules/blast/ports.js';
import { OctokitPriorPrSource } from '../adapters/github/pr-history.js';
import { BlastRepository } from '../modules/blast/repository.js';
import { BlastService } from '../modules/blast/service.js';
import { GitHubChangedFiles } from '../modules/blast/sources.js';
import type { ProjectContextResolver, RepoDocsSource } from '../modules/project-context/ports.js';
import { ProjectContextRepository } from '../modules/project-context/repository.js';
import { ProjectContextService } from '../modules/project-context/service.js';
import { resolveGlob } from '../modules/project-context/glob.js';
import { FsRepoDocsSource } from '../adapters/repo-docs/fs.js';
import type { RepoFiles } from '../modules/onboarding/ports.js';
import { OnboardingRepository } from '../modules/onboarding/repository.js';
import { OnboardingService } from '../modules/onboarding/service.js';
import { FsRepoFiles } from '../adapters/repo-files/fs.js';
import { BriefRepository } from '../modules/brief/repository.js';
import { BriefService } from '../modules/brief/service.js';
import { BRIEF_TIMEOUT_MS } from '../modules/brief/constants.js';
import { classifyFile } from '../modules/reviews/smart-diff/classify.js';
import type { EvalCaseLinks } from '../modules/reviews/ports.js';
import { EvalRepository } from '../modules/eval/repository.js';
import { EvalService } from '../modules/eval/service.js';
import { createAgentConfigs } from '../modules/eval/agent-configs.js';
import { EVAL_LLM } from '../modules/eval/constants.js';
import { sameAgentConfig } from '../modules/agents/helpers.js';
import type { AgentSource, EvalAgent, LlmProviderId } from '../modules/eval/ports.js';
import { parseUnifiedDiff } from '../adapters/git/diff-parser.js';
import { buildLineIndex, buildTaskLine, isFullFileKind, reviewPullRequest } from '@devdigest/reviewer-core';

/**
 * DI container. One per app instance. Holds config, db, the JobRunner,
 * the SSE bus, and lazily-constructed adapters resolved through SecretsProvider.
 *
 * Tests construct a container with `overrides` to inject mock adapters; the
 * Services depend on these interfaces, not the concrete classes.
 */
export interface ContainerOverrides {
  secrets?: SecretsProvider;
  auth?: AuthProvider;
  github?: GitHubClient;
  git?: GitClient;
  codeIndex?: CodeIndex;
  embedder?: Embedder;
  /** Pre-built providers by id (skip key lookup). */
  llm?: Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>;
  /** repo-intel facade (T1.1+) — tests inject mock RepoIntel implementations. */
  repoIntel?: RepoIntel;
  /** repo-intel T3 adapters — only the indexer pipeline reads these. */
  depgraph?: DepGraph;
  tokenizer?: Tokenizer;
  /** Intent layer — tests inject a fake deriver. */
  intent?: IntentDeriver;
  /** Prior-PR source (GitHub GraphQL) — tests inject a mock so no GITHUB_TOKEN is used. */
  priorPrs?: PriorPrSource;
  /** Project-context repo-clone reader — tests inject `MockRepoDocsSource`. */
  repoDocs?: RepoDocsSource;
  /** Onboarding repo-clone reader — tests inject `MockRepoFiles`. */
  repoFiles?: RepoFiles;
}

export class Container {
  readonly config: AppConfig;
  readonly db: Db;
  readonly secrets: SecretsProvider;
  readonly auth: AuthProvider;
  readonly jobs: JobRunner;
  readonly runBus: RunBus;

  private _git?: GitClient;
  private _github?: GitHubClient;
  private _codeIndex?: CodeIndex;
  private _embedder?: Embedder;
  private llmCache = new Map<string, LLMProvider>();
  private evalLlmCache = new Map<string, LLMProvider>();

  // Shared repositories for cross-cutting entities (agents, reviews/pulls,
  // runs). Constructed here, in the composition root, so consuming modules use
  // `container.agentsRepo` instead of reaching into another module's folder.
  private _agentsRepo?: AgentsRepository;
  private _reviewRepo?: ReviewRepository;
  private _repoIntel?: RepoIntel;
  private _depgraph?: DepGraph;
  private _tokenizer?: Tokenizer;
  private _priceBook?: PriceBook;
  private _intent?: IntentDeriver;
  private _translation?: Translator;
  private _blast?: BlastReader & BlastHistoryReader;
  private _priorPrs?: PriorPrSource;
  private _projectContext?: ProjectContextService;
  private _onboarding?: OnboardingService;
  private _brief?: BriefService;
  private _eval?: EvalService;
  private _evalRepo?: EvalRepository;

  constructor(config: AppConfig, db: Db, private overrides: ContainerOverrides = {}) {
    this.config = config;
    this.db = db;
    this.secrets = overrides.secrets ?? new LocalSecretsProvider(config.secretsPath);
    this.auth = overrides.auth ?? new LocalNoAuthProvider(db);
    this.runBus = runBus;
    this.jobs = new JobRunner(db);
  }

  get git(): GitClient {
    if (this.overrides.git) return this.overrides.git;
    this._git ??= new SimpleGitClient(this.config.cloneDir);
    return this._git;
  }

  get agentsRepo(): AgentsRepository {
    return (this._agentsRepo ??= new AgentsRepository(this.db));
  }

  get reviewRepo(): ReviewRepository {
    return (this._reviewRepo ??= new ReviewRepository(this.db));
  }

  /**
   * Intent layer. A singleton per container on purpose: the service's in-flight
   * map (one LLM call per PR at a time) is shared by the routes and the run executor.
   */
  get intent(): IntentDeriver {
    if (this.overrides.intent) return this.overrides.intent;
    if (!this._intent) {
      const repo = new IntentRepository(this.db);
      this._intent = new IntentService({
        store: repo,
        pulls: repo,
        sources: new GitHubIntentSources({
          github: () => this.github(),
          git: this.git,
          pulls: repo,
        }),
        llm: (provider) => this.llm(provider),
        modelChoice: async (workspaceId) =>
          (await getFeatureModelOverride(this, workspaceId, 'review_intent')) ?? {
            provider: DEFAULT_INTENT_PROVIDER,
            model: DEFAULT_INTENT_MODEL,
          },
      });
    }
    return this._intent;
  }

  /**
   * Finding translation. A singleton per container on purpose: the service's
   * in-flight map (one LLM call per review+language at a time) must be shared.
   */
  get translation(): Translator {
    this._translation ??= new TranslationService({
      store: new TranslationRepository(this.db),
      llm: (provider) => this.llm(provider),
      modelChoice: (workspaceId) => resolveFeatureModel(this, workspaceId, 'translation'),
      language: (workspaceId) => resolveTranslationLanguage(this, workspaceId),
    });
    return this._translation;
  }

  /** Blast radius read model (pure read over the repo-intel facade; goes through `this.repoIntel` so test overrides apply). */
  get blast(): BlastReader & BlastHistoryReader {
    this._blast ??= new BlastService({
      pulls: new BlastRepository(this.db),
      remoteFiles: new GitHubChangedFiles({ github: () => this.github() }),
      intel: this.repoIntel,
      history: () => this.priorPrSource(),
      intelEnabled: () => this.config.repoIntelEnabled,
    });
    return this._blast;
  }

  /** Project Context (attached markdown docs): discovery, attachments, run-time resolution. */
  get projectContext(): ProjectContextService & ProjectContextResolver {
    this._projectContext ??= new ProjectContextService({
      store: new ProjectContextRepository(this.db),
      docs: this.overrides.repoDocs ?? new FsRepoDocsSource(),
      glob: resolveGlob(this.config.projectContextGlob),
      log: { warn: (msg) => console.warn(msg) },
    });
    return this._projectContext;
  }

  /**
   * Onboarding tour. A singleton per container on purpose: the service's
   * in-flight map (one generation per repository at a time) must be shared.
   */
  get onboarding(): OnboardingService {
    this._onboarding ??= new OnboardingService({
      store: new OnboardingRepository(this.db),
      files: this.overrides.repoFiles ?? new FsRepoFiles(),
      index: this.repoIntel,
      head: { currentHead: (owner, name) => this.git.currentHead({ owner, name }) },
      llm: (provider) => this.llm(provider),
      modelChoice: (workspaceId) => resolveFeatureModel(this, workspaceId, 'onboarding'),
      timeoutMs: this.config.onboardingTimeoutMs,
    });
    return this._onboarding;
  }

  /**
   * PR Brief. A singleton per container on purpose: the service's in-flight
   * map (one generation per PR at a time) must be shared.
   */
  get brief(): BriefService {
    this._brief ??= new BriefService({
      store: new BriefRepository(this.db),
      intent: {
        get: async (workspaceId, prId) => {
          const stored = await this.intent.get(workspaceId, prId);
          return stored
            ? { intent: stored.intent, in_scope: stored.inScope, out_of_scope: stored.outOfScope }
            : null;
        },
      },
      blast: this.blast,
      specDocs: this.projectContext,
      roleOf: classifyFile,
      llm: (provider) => this.llm(provider),
      modelChoice: (workspaceId) => resolveFeatureModel(this, workspaceId, 'risk_brief'),
      timeoutMs: BRIEF_TIMEOUT_MS,
    });
    return this._brief;
  }

  private get evalRepo(): EvalRepository {
    return (this._evalRepo ??= new EvalRepository(this.db));
  }

  /**
   * Eval pipeline. A singleton per container on purpose: runs execute in the
   * background and the service holds the executor. Agents are reached through a
   * narrow `AgentSource` over `agentsRepo`; the engine is `reviewPullRequest`
   * with only the inputs an eval case carries (no repo context).
   */
  get eval(): EvalService {
    if (!this._eval) {
      const toEvalAgent = (a: Awaited<ReturnType<AgentsRepository['list']>>[number]): EvalAgent => ({
        id: a.id,
        name: a.name,
        enabled: a.enabled,
        version: a.version,
        provider: a.provider as LlmProviderId,
        model: a.model,
        strategy: a.strategy,
        systemPrompt: a.systemPrompt,
      });
      const agentSource: AgentSource = {
        list: async (workspaceId) => (await this.agentsRepo.list(workspaceId)).map(toEvalAgent),
        get: async (workspaceId, agentId) => {
          const a = await this.agentsRepo.getById(workspaceId, agentId);
          return a ? toEvalAgent(a) : undefined;
        },
        enabledSkillIds: async (agentId) =>
          (await this.agentsRepo.linkedSkills(agentId))
            .filter((l) => l.enabled && l.skill.enabled)
            .map((l) => l.skill.id),
      };
      this._eval = new EvalService({
        cases: this.evalRepo,
        runs: this.evalRepo,
        findings: this.evalRepo,
        agents: agentSource,
        dashboard: this.evalRepo,
        configs: createAgentConfigs({
          getAgent: (workspaceId, agentId) => this.agentsRepo.getById(workspaceId, agentId),
          getVersionConfig: async (agentId, version) => {
            const row = await this.agentsRepo.getVersion(agentId, version);
            const parsed = row ? AgentVersionConfig.safeParse(row.configJson) : undefined;
            return parsed?.success ? parsed.data : undefined;
          },
          isSame: sameAgentConfig,
        }),
        engine: async (input) => {
          const outcome = await reviewPullRequest({
            systemPrompt: input.systemPrompt,
            model: input.model,
            diff: input.diff,
            llm: input.llm,
            strategy: input.strategy as 'auto' | 'single-pass' | 'map-reduce',
            task: input.task,
            ...(input.prDescription ? { prDescription: input.prDescription } : {}),
            sessionId: input.sessionId,
          });
          return {
            kept: outcome.review.findings,
            dropped: outcome.dropped.length,
            costUsd: outcome.costUsd,
          };
        },
        parseDiff: parseUnifiedDiff,
        lineIndex: buildLineIndex,
        isFullFileKind,
        taskLine: buildTaskLine,
        llm: (provider) => this.evalLlm(provider),
        isConfigError: (err) => err instanceof ConfigError,
      });
    }
    return this._eval;
  }

  /** Finding -> eval case links for the reviews read (reviews port, implemented by the eval repository). */
  get evalCaseLinks(): EvalCaseLinks {
    return this.evalRepo;
  }

  get codeIndex(): CodeIndex {
    if (this.overrides.codeIndex) return this.overrides.codeIndex;
    this._codeIndex ??= new RipgrepCodeIndex(this.git);
    return this._codeIndex;
  }

  /**
   * The repo-intel facade (T1.1). All higher-level features (reviews,
   * blast/onboarding migrations, phantom-gate) code against this interface.
   * Tests inject a mock via `ContainerOverrides.repoIntel`.
   */
  get repoIntel(): RepoIntel {
    if (this.overrides.repoIntel) return this.overrides.repoIntel;
    this._repoIntel ??= new RepoIntelService(this);
    return this._repoIntel;
  }

  /** Import-graph builder (dependency-cruiser). T3 indexer pipeline only. */
  get depgraph(): DepGraph {
    if (this.overrides.depgraph) return this.overrides.depgraph;
    this._depgraph ??= new DepCruiseGraph();
    return this._depgraph;
  }

  /** Token counter (js-tiktoken) for the repo-map budget search. */
  get tokenizer(): Tokenizer {
    if (this.overrides.tokenizer) return this.overrides.tokenizer;
    this._tokenizer ??= new TiktokenTokenizer();
    return this._tokenizer;
  }

  /**
   * Live OpenRouter pricing for cost attribution. The lister builds a bare
   * OpenRouter provider just for `/models` (no estimator needed) and degrades to
   * `[]` when no key is configured; the static `estimateCost` table is the
   * fallback for OpenAI/Anthropic and a cold/cold-failed cache.
   */
  get priceBook(): PriceBook {
    this._priceBook ??= new PriceBook(async () => {
      try {
        const key = await this.secrets.get('OPENROUTER_API_KEY');
        if (!key) return [];
        return await new OpenRouterProvider(key).listModels();
      } catch {
        return [];
      }
    }, estimateCost);
    return this._priceBook;
  }

  async github(): Promise<GitHubClient> {
    if (this.overrides.github) return this.overrides.github;
    if (this._github) return this._github;
    const token = await this.secrets.get('GITHUB_TOKEN');
    if (!token) throw new ConfigError('GITHUB_TOKEN is not configured');
    this._github = new OctokitGitHubClient(token);
    return this._github;
  }

  /** Prior-PR source; throws (no token) so the blast service reports `available:false`. */
  async priorPrSource(): Promise<PriorPrSource> {
    if (this.overrides.priorPrs) return this.overrides.priorPrs;
    if (this._priorPrs) return this._priorPrs;
    const token = await this.secrets.get('GITHUB_TOKEN');
    if (!token) throw new ConfigError('GITHUB_TOKEN is not configured');
    this._priorPrs = OctokitPriorPrSource.fromToken(token);
    return this._priorPrs;
  }

  /** Resolve an LLM provider by id; constructs from the secret key, cached. */
  async llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    const injected = this.overrides.llm?.[id];
    if (injected) return injected;
    const cached = this.llmCache.get(id);
    if (cached) return cached;
    const provider = await this.buildLlm(id);
    this.llmCache.set(id, provider);
    return provider;
  }

  /**
   * Provider for eval runs: OpenRouter with a longer timeout and no SDK retries (see EVAL_LLM).
   * Other providers are the regular ones.
   */
  async evalLlm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    if (id !== 'openrouter' || this.overrides.llm?.[id]) return this.llm(id);
    const cached = this.evalLlmCache.get(id);
    if (cached) return cached;
    const key = await this.secrets.get('OPENROUTER_API_KEY');
    if (!key) throw new ConfigError('OPENROUTER_API_KEY is not configured');
    const provider = new OpenRouterProvider(key, {
      estimateCost: (model, tokensIn, tokensOut) => this.priceBook.estimate(model, tokensIn, tokensOut),
      timeoutMs: EVAL_LLM.timeoutMs,
      maxRetries: EVAL_LLM.maxRetries,
    });
    this.evalLlmCache.set(id, provider);
    return provider;
  }

  private async buildLlm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    if (id === 'openai') {
      const key = await this.secrets.get('OPENAI_API_KEY');
      if (!key) throw new ConfigError('OPENAI_API_KEY is not configured');
      return new OpenAIProvider(key);
    }
    if (id === 'openrouter') {
      // Single OpenRouter provider lives in reviewer-core (shared with the CI
      // runner); inject the PriceBook so cost attribution uses LIVE OpenRouter
      // prices (with the static table as a fallback) rather than a hardcoded one.
      const key = await this.secrets.get('OPENROUTER_API_KEY');
      if (!key) throw new ConfigError('OPENROUTER_API_KEY is not configured');
      return new OpenRouterProvider(key, {
        estimateCost: (model, tokensIn, tokensOut) =>
          this.priceBook.estimate(model, tokensIn, tokensOut),
      });
    }
    const key = await this.secrets.get('ANTHROPIC_API_KEY');
    if (!key) throw new ConfigError('ANTHROPIC_API_KEY is not configured');
    return new AnthropicProvider(key);
  }

  async embedder(): Promise<Embedder> {
    // Injected embedders (tests) always win. Otherwise embeddings are gated by
    // config: when disabled we throw BEFORE constructing the OpenAI client, so
    // the app makes ZERO OpenAI requests. All callers wrap this in try/catch and
    // degrade gracefully (memory/RAG simply returns no hits).
    if (this.overrides.embedder) return this.overrides.embedder;
    if (!this.config.embeddingsEnabled) {
      throw new ConfigError('Embeddings are disabled (set EMBEDDINGS_ENABLED=true to enable memory/RAG)');
    }
    if (this._embedder) return this._embedder;
    const openai = await this.llm('openai');
    this._embedder = new OpenAIEmbedder(openai);
    return this._embedder;
  }

  /**
   * Drop cached provider clients so the next resolve picks up changed secrets.
   * Call after persisting a new API key/PAT via SecretsProvider.set.
   */
  invalidateSecretCaches(): void {
    this.llmCache.clear();
    this.evalLlmCache.clear();
    this._github = undefined;
    this._priorPrs = undefined;
    this._embedder = undefined;
  }
}
