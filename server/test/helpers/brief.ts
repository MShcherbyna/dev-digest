import { ProjectContextService } from '../../src/modules/project-context/service.js';
import { resolveGlob } from '../../src/modules/project-context/glob.js';
import type { ProjectContextStore, UsedByRow } from '../../src/modules/project-context/ports.js';
import { MockRepoDocsSource, type MockRepoDocsFiles } from '../../src/adapters/mocks.js';
import type { Db } from '../../src/db/client.js';
import * as t from '../../src/db/schema.js';
import type { RepoIntel } from '../../src/modules/repo-intel/index.js';

/**
 * Real `ProjectContextService.resolveForBrief` over an in-memory clone and
 * per-repo "used by" rows. Only `usedByRows` of the store is exercised by it.
 */
export function makeDocsService(files: MockRepoDocsFiles | null, rowsByRepo: Record<string, UsedByRow[]>) {
  const calls: string[] = [];
  const store = {
    usedByRows: async (_ws: string, repoId: string) => {
      calls.push(repoId);
      return rowsByRepo[repoId] ?? [];
    },
  } as unknown as ProjectContextStore;
  const service = new ProjectContextService({
    store,
    docs: new MockRepoDocsSource(files),
    glob: resolveGlob(undefined),
    log: { warn: () => undefined },
  });
  return { service, calls };
}

/** The brief model answer used by the `.it` suites; every anchor is inside the seeded patches. */
export const BRIEF_FIXTURE = {
  summary: 'Adds a token-bucket limiter in front of the public API.',
  risks: [
    {
      kind: 'security',
      title: 'Limiter bypass',
      explanation: 'A forged header may bypass the limiter.',
      severity: 'high',
      file_refs: ['src/limiter.ts:12', 'src/limiter.ts:900', 'src/ghost.ts:1'],
    },
  ],
  review_focus: [
    { file: 'src/limiter.ts', line: 12, reason: 'core of the limiter' },
    { file: 'src/limiter.ts', line: 500, reason: 'outside every hunk' },
    { file: 'src/ghost.ts', line: 1, reason: 'file is not in the PR' },
    { file: 'src/api/handler.ts', line: 41, reason: 'blast caller line' },
  ],
};

export const PATCH_SENTINEL = 'PATCH_CODE_SENTINEL_77c1';

/**
 * repo-intel facade fake for the blast read model: a full index with one
 * changed symbol and one caller in a file that is NOT part of the PR diff.
 * Only the three methods blast uses; the rest of the facade is unused.
 */
export const fakeBlastIntel = {
  getBlastRadius: async () => ({
    changedSymbols: [{ file: 'src/limiter.ts', name: 'limit', kind: 'function' }],
    callers: [{ file: 'src/api/handler.ts', symbol: 'run', viaSymbol: 'limit', line: 41, rank: 1 }],
    impactedEndpoints: [],
    factsByFile: {},
    degraded: false,
  }),
  getIndexState: async () => ({ status: 'full', lastIndexedSha: 'head-1', filesIndexed: 3, updatedAt: new Date() }),
} as unknown as RepoIntel;

let seq = 0;

/** A repo + PR (+ `pr_files` with real hunks, so `pr_files` is filled as after `GET /pulls/:id`). */
export async function seedBriefPr(
  db: Db,
  opts: { workspaceId: string; files?: boolean; headSha?: string },
) {
  const n = seq++;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId: opts.workspaceId, owner: 'acme', name: `brief-${n}`, fullName: `acme/brief-${n}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId: opts.workspaceId,
      repoId: repo!.id,
      number: 100 + n,
      title: 'Add rate limiting',
      author: 'dev',
      branch: 'feat/limit',
      base: 'main',
      headSha: opts.headSha ?? 'head-1',
      additions: 104,
      deletions: 3,
      filesCount: 2,
      status: 'needs_review',
      body: 'Throttles the public API.',
    })
    .returning();
  if (opts.files !== false) {
    await db.insert(t.prFiles).values([
      {
        prId: pr!.id,
        path: 'src/limiter.ts',
        additions: 84,
        deletions: 3,
        patch: `@@ -1,2 +10,10 @@\n+const x = '${PATCH_SENTINEL}';`,
      },
      { prId: pr!.id, path: 'src/limiter.test.ts', additions: 20, deletions: 0, patch: '@@ -0,0 +1,20 @@\n+test' },
    ]);
  }
  return { repoId: repo!.id, prId: pr!.id };
}
