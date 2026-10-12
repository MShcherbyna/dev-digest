import { AppError, NotFoundError } from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import { checkCommand, readComposeServices } from './commands.js';
import {
  COMPOSE_NAMES,
  ENV_EXAMPLE_NAMES,
  EXCLUDED_DIRS,
  LOG_CAUSE_MAX_CHARS,
  MAX_CHAINS,
  MAX_COMPOSE_FILES,
  MAX_FACT_FILE_BYTES,
  MAX_PACKAGE_JSONS,
  MAX_RUN_COMMANDS,
  OUTPUT_MAX_TOKENS,
  PACKAGE_JSON,
  README_NAMES,
  SHALLOW_TREE_DEPTH,
  SHALLOW_TREE_MAX,
  TOP_FILES,
  TOUR_SCHEMA_NAME,
} from './constants.js';
import { envVarNames, scriptsOf, truncateReadme } from './facts.js';
import {
  capList,
  countUnverifiedProsePaths,
  extractProsePaths,
  groundCriticalPaths,
  groundFirstTasks,
  groundReadingPath,
  isStale,
  toIndexSummary,
  validateDiagram,
  type KindOf,
} from './helpers.js';
import { buildTourMessages } from './prompt.js';
import { OnboardingTour, TourModelOutput } from './schemas.js';
import type { OnboardingState } from './schemas.js';
import type {
  FsKind,
  OnboardingDeps,
  OnboardingLog,
  RepoFacts,
  RepoFiles,
  RepoLocation,
} from './ports.js';

type Outcome = 'ok' | 'missing_api_key' | 'provider_error' | 'invalid_output';

/** 409s are request rejections, not generation attempts: they write no log line. */
const UNLOGGED_CODES = new Set(['not_cloned', 'generation_in_progress']);

interface Stats {
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  cause: string | null;
  dropped: {
    critical_paths: { invalid: number; overflow: number };
    reading_path: { invalid: number; overflow: number };
    first_tasks: { invalid: number; overflow: number };
    run_locally: { undeclared: number; overflow: number };
  };
  proseUnverified: number;
}

function newStats(): Stats {
  return {
    provider: null,
    model: null,
    tokensIn: null,
    tokensOut: null,
    cause: null,
    dropped: {
      critical_paths: { invalid: 0, overflow: 0 },
      reading_path: { invalid: 0, overflow: 0 },
      first_tasks: { invalid: 0, overflow: 0 },
      run_locally: { undeclared: 0, overflow: 0 },
    },
    proseUnverified: 0,
  };
}

const errMessage = (err: unknown): string =>
  (err instanceof Error ? err.message : 'unknown error').slice(0, LOG_CAUSE_MAX_CHARS);

const GENERIC: Record<string, string> = {
  provider_error: 'Could not generate the onboarding tour with the configured model',
  invalid_output: 'The model returned an onboarding tour that could not be used',
};

function toAppError(err: unknown, stats: Stats): AppError {
  if (err instanceof AppError) return err;
  stats.cause ??= errMessage(err);
  return new AppError('provider_error', GENERIC.provider_error!, 502);
}

/**
 * Collects the prompt facts from the clone. Reads ONLY package.json, compose
 * files, root README and root .env.example/.env.sample (never `.env`), and
 * keeps env variable NAMES only. Exported for the AC-10 test.
 */
export async function gatherFacts(
  files: RepoFiles,
  clonePath: string,
  base: Pick<RepoFacts, 'fullName' | 'defaultBranch' | 'index' | 'topFiles' | 'chains'>,
): Promise<RepoFacts> {
  const accept = (rel: string): boolean => {
    const name = rel.split('/').pop() ?? '';
    if (name === PACKAGE_JSON || COMPOSE_NAMES.has(name)) return true;
    const atRoot = !rel.includes('/');
    return atRoot && (ENV_EXAMPLE_NAMES.has(name) || README_NAMES.has(name));
  };
  const found = (await files.walk(clonePath, EXCLUDED_DIRS, accept)) ?? [];
  const byDepth = (a: { path: string }, b: { path: string }) =>
    a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path);
  const sorted = [...found].sort(byDepth);
  const nameOf = (p: string) => p.split('/').pop() ?? '';

  const readText = async (path: string): Promise<string | null> => {
    const r = await files.read(clonePath, path, MAX_FACT_FILE_BYTES);
    return r.kind === 'ok' ? r.content : null;
  };

  const packageScripts: RepoFacts['packageScripts'] = [];
  for (const f of sorted.filter((x) => nameOf(x.path) === PACKAGE_JSON).slice(0, MAX_PACKAGE_JSONS)) {
    const text = await readText(f.path);
    if (text !== null) packageScripts.push({ path: f.path, scripts: scriptsOf(text) });
  }

  const composeServices: RepoFacts['composeServices'] = [];
  for (const f of sorted.filter((x) => COMPOSE_NAMES.has(nameOf(x.path))).slice(0, MAX_COMPOSE_FILES)) {
    const text = await readText(f.path);
    if (text !== null) composeServices.push({ path: f.path, services: [...readComposeServices(text)] });
  }

  const envNames: string[] = [];
  for (const f of sorted.filter((x) => !x.path.includes('/') && ENV_EXAMPLE_NAMES.has(x.path))) {
    const text = await readText(f.path);
    if (text !== null) for (const n of envVarNames(text)) if (!envNames.includes(n)) envNames.push(n);
  }

  let readme = '';
  const readmeFile = sorted.find((x) => !x.path.includes('/') && README_NAMES.has(x.path));
  if (readmeFile) readme = truncateReadme((await readText(readmeFile.path)) ?? '');

  const tree = await files.listShallow(clonePath, SHALLOW_TREE_DEPTH, SHALLOW_TREE_MAX, EXCLUDED_DIRS);
  return { ...base, tree, packageScripts, composeServices, envNames, readme };
}

/**
 * Generates and stores the per-repository onboarding tour. A container
 * singleton on purpose: the in-flight map is the single source for `generating`
 * and for the one-generation-at-a-time rule.
 */
export class OnboardingService {
  private inflight = new Map<string, object>();

  constructor(private deps: OnboardingDeps) {}

  async getState(workspaceId: string, repoId: string): Promise<OnboardingState> {
    const repo = await this.deps.store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    const cloned = repo.clonePath !== null && (await this.deps.files.isDirectory(repo.clonePath));
    const index = toIndexSummary(await this.deps.index.getIndexState(repoId));
    const tour = await this.deps.store.getTour(repoId);
    return {
      cloned,
      generating: this.inflight.has(repoId),
      index,
      stale: isStale(tour, index.last_indexed_sha),
      tour,
    };
  }

  async generate(workspaceId: string, repoId: string, log: OnboardingLog): Promise<OnboardingTour> {
    const repo = await this.deps.store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');

    // Check-and-set with no await in between: two concurrent calls cannot both pass.
    if (this.inflight.has(repoId)) {
      throw new AppError('generation_in_progress', 'A generation is already running for this repository', 409);
    }
    const token = {};
    this.inflight.set(repoId, token);

    const t0 = Date.now();
    const stats = newStats();
    let logged = false;
    const emit = (outcome: Outcome): void => {
      if (logged) return;
      logged = true;
      const line = {
        repo_id: repoId,
        provider: stats.provider,
        model: stats.model,
        tokens_in: stats.tokensIn,
        tokens_out: stats.tokensOut,
        duration_ms: Date.now() - t0,
        outcome,
        dropped: stats.dropped,
        prose_unverified_paths: stats.proseUnverified,
      };
      if (outcome === 'ok') log.info(line, 'onboarding: tour generated');
      else log.warn({ ...line, cause: stats.cause }, 'onboarding: generation failed');
    };

    try {
      const clonePath = repo.clonePath;
      if (!clonePath || !(await this.deps.files.isDirectory(clonePath))) {
        throw new AppError('not_cloned', 'The repository has not been cloned', 409);
      }
      const work = this.run(workspaceId, repo, clonePath, token, stats);
      work.catch(() => undefined); // a timed-out run may still reject later
      try {
        const tour = await withTimeout(work, this.deps.timeoutMs);
        emit('ok');
        return tour;
      } catch (err) {
        const app =
          err instanceof TimeoutError
            ? new AppError('provider_error', GENERIC.provider_error!, 502)
            : toAppError(err, stats);
        if (err instanceof TimeoutError) stats.cause ??= errMessage(err);
        if (!UNLOGGED_CODES.has(app.code)) emit(app.code as Outcome);
        // Surface the (already truncated) cause so the studio can show why a
        // generation failed without needing the server log.
        if ((app.code === 'provider_error' || app.code === 'invalid_output') && stats.cause) {
          throw new AppError(app.code, app.message, app.statusCode, { cause: stats.cause });
        }
        throw app;
      }
    } finally {
      if (this.inflight.get(repoId) === token) this.inflight.delete(repoId);
    }
  }

  private async run(
    workspaceId: string,
    repo: RepoLocation,
    clonePath: string,
    token: object,
    stats: Stats,
  ): Promise<OnboardingTour> {
    const { files, index: indexPort } = this.deps;

    const index = toIndexSummary(await indexPort.getIndexState(repo.id));
    const [topFiles, allChains] = await Promise.all([
      indexPort.getTopFilesByRank(repo.id, TOP_FILES),
      indexPort.getCriticalPaths(repo.id),
    ]);
    const chains = allChains.slice(0, MAX_CHAINS);

    let commitSha = index.last_indexed_sha;
    if (commitSha === null) {
      try {
        commitSha = await this.deps.head.currentHead(repo.owner, repo.name);
      } catch {
        throw new AppError('not_cloned', 'The repository clone could not be read', 409);
      }
    }

    const facts = await gatherFacts(files, clonePath, {
      fullName: repo.fullName,
      defaultBranch: repo.defaultBranch,
      index: { status: index.status, filesIndexed: index.files_indexed },
      topFiles,
      chains,
    });

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

    let output: TourModelOutput;
    try {
      const res = await llm.completeStructured<TourModelOutput>({
        model: choice.model,
        schema: TourModelOutput,
        schemaName: TOUR_SCHEMA_NAME,
        messages: await buildTourMessages(facts),
        temperature: 0,
        maxTokens: OUTPUT_MAX_TOKENS,
        timeoutMs: this.deps.timeoutMs,
        maxRetries: 1,
      });
      stats.tokensIn = res.tokensIn ?? null;
      stats.tokensOut = res.tokensOut ?? null;
      const parsed = TourModelOutput.safeParse(res.data);
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

    // Grounding: the model's output is untrusted; every path hits the real clone.
    const memo = new Map<string, Promise<FsKind>>();
    const kindOf: KindOf = (rel) => {
      let p = memo.get(rel);
      if (!p) {
        p = files.kind(clonePath, rel);
        memo.set(rel, p);
      }
      return p;
    };

    const critical = await groundCriticalPaths(output.critical_paths, kindOf);
    const reading = await groundReadingPath(output.reading_path, kindOf);
    const tasks = await groundFirstTasks(output.first_tasks, kindOf);

    const scripts = new Set(facts.packageScripts.flatMap((p) => p.scripts));
    const services = new Set(facts.composeServices.flatMap((c) => c.services));
    let undeclared = 0;
    const okCommands = output.run_locally.filter((c) => {
      const good = c.command.trim() !== '' && checkCommand(c.command, scripts, services).ok;
      if (!good) undeclared++;
      return good;
    });
    const commands = capList(okCommands, MAX_RUN_COMMANDS);

    stats.dropped = {
      critical_paths: { invalid: critical.droppedInvalid, overflow: critical.droppedOverflow },
      reading_path: { invalid: reading.droppedInvalid, overflow: reading.droppedOverflow },
      first_tasks: { invalid: tasks.droppedInvalid, overflow: tasks.droppedOverflow },
      run_locally: { undeclared, overflow: okCommands.length - commands.length },
    };
    stats.proseUnverified = await countUnverifiedProsePaths(
      extractProsePaths(output.architecture.summary),
      kindOf,
    );

    const tour = OnboardingTour.parse({
      repo_id: repo.id,
      generated_at: (this.deps.now?.() ?? new Date()).toISOString(),
      commit_sha: commitSha,
      files_indexed: index.files_indexed,
      partial_index: index.status !== 'full',
      architecture: {
        summary: output.architecture.summary,
        diagram: validateDiagram(output.architecture.nodes, output.architecture.edges),
      },
      critical_paths: critical.kept,
      run_locally: commands.map((c) => ({ command: c.command })),
      reading_path: reading.kept,
      first_tasks: tasks.kept,
    });

    // The deadline may have fired while we worked: never persist a timed-out run.
    if (this.inflight.get(repo.id) !== token) return tour;
    await this.deps.store.upsertTour(repo.id, tour);
    return tour;
  }
}
