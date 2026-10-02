import { NotFoundError } from '../../platform/errors.js';
import { HISTORY_CACHE_MAX, HISTORY_CACHE_TTL_MS, HISTORY_MAX_FILES, HISTORY_MAX_ITEMS } from './constants.js';
import { emptyView, toBlastRadiusView } from './helpers.js';
import { toPriorPrs } from './history.js';
import type {
  BlastHistoryReader,
  BlastIntel,
  BlastPull,
  BlastPullReader,
  BlastRadiusView,
  BlastReader,
  BlastRemoteFiles,
  PriorPrSource,
  PriorPrsView,
} from './ports.js';

export interface BlastDeps {
  pulls: BlastPullReader;
  remoteFiles: BlastRemoteFiles;
  intel: BlastIntel;
  /** Resolves the prior-PR source; may throw (no token) -> `available:false`. */
  history: () => Promise<PriorPrSource>;
  now?: () => number;
  intelEnabled: () => boolean;
}

/**
 * Blast radius of a PR: persisted changed files -> one repo-intel facade read
 * -> grouped view. No LLM, no re-analysis, no writes.
 */
const UNAVAILABLE: PriorPrsView = { history: [], available: false };

export class BlastService implements BlastReader, BlastHistoryReader {
  /** Per-instance (the container owns the single instance); only `available:true` results are kept. */
  private historyCache = new Map<string, { at: number; view: PriorPrsView }>();

  constructor(private deps: BlastDeps) {}

  private async changedPaths(pull: BlastPull): Promise<string[]> {
    const stored = await this.deps.pulls.listChangedPaths(pull.prId);
    return stored.length > 0 ? stored : this.deps.remoteFiles.listChangedPaths(pull);
  }


  async get(workspaceId: string, prId: string): Promise<BlastRadiusView> {
    const { pulls, intel, intelEnabled } = this.deps;
    const pull = await pulls.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const paths = await this.changedPaths(pull);
    if (paths.length === 0) return emptyView('no_changed_files');

    const [result, state] = await Promise.all([
      intel.getBlastRadius(pull.repoId, paths),
      intel.getIndexState(pull.repoId),
    ]);
    return toBlastRadiusView(result, state, intelEnabled());
  }

  /** Prior merged PRs touching the changed files. Never throws for GitHub problems. */
  async history(workspaceId: string, prId: string): Promise<PriorPrsView> {
    const { pulls, history, now = Date.now } = this.deps;
    const pull = await pulls.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const key = `${pull.prId}:${pull.headSha}`;
    const cached = this.historyCache.get(key);
    if (cached && now() - cached.at < HISTORY_CACHE_TTL_MS) return cached.view;

    const paths = await this.changedPaths(pull);
    if (paths.length === 0) return UNAVAILABLE;

    let view: PriorPrsView;
    try {
      const source = await history();
      const hits = await source.listForPaths({
        repo: pull.repo,
        ref: pull.base,
        paths: paths.slice(0, HISTORY_MAX_FILES),
      });
      view = {
        history: toPriorPrs(hits, { currentNumber: pull.number, changedPaths: paths, limit: HISTORY_MAX_ITEMS }),
        available: true,
      };
    } catch {
      return UNAVAILABLE;
    }

    this.historyCache.delete(key);
    this.historyCache.set(key, { at: now(), view });
    while (this.historyCache.size > HISTORY_CACHE_MAX) {
      const oldest = this.historyCache.keys().next().value;
      if (oldest === undefined) break;
      this.historyCache.delete(oldest);
    }
    return view;
  }
}
