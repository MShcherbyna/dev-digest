# Onion Architecture — examples (DevDigest server)

Based on the `repos` module. "Bad" snippets reflect the current shape of that module; "good" is the target for new/touched code.

## 1. Service dependencies

```ts
// BAD — service locator + concrete repository
export class RepoService {
  private repo: RepoRepository;
  constructor(private container: Container) {
    this.repo = new RepoRepository(container.db);
  }
}
```

```ts
// GOOD — ports.ts (application layer)
import type { Repo } from '@devdigest/shared';

export interface RepoStore {
  findByFullName(workspaceId: string, fullName: string): Promise<Repo | undefined>;
  insert(input: NewRepo, tx?: Tx): Promise<Repo>;
}

// service.ts
export class RepoService {
  constructor(
    private store: RepoStore,
    private git: GitClient,
    private jobs: JobPort,
  ) {}
}

// container.ts (composition root) — the only place that news concrete classes
get repoService() {
  return (this._repoService ??= new RepoService(
    new DrizzleRepoStore(this.db),
    this.git,
    this.jobs,
  ));
}
```

## 2. Repository returns domain types

```ts
// BAD — DB row leaks upward
export type RepoRow = typeof t.repos.$inferSelect;
async findByFullName(...): Promise<RepoRow | undefined> { /* ... */ }
```

```ts
// GOOD — repository.ts (infrastructure) maps rows to shared/domain types
const toRepo = (row: typeof t.repos.$inferSelect): Repo => ({
  id: row.id,
  fullName: row.fullName,
  // ...
});

export class DrizzleRepoStore implements RepoStore {
  constructor(private db: Db) {}
  async findByFullName(workspaceId: string, fullName: string) {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, fullName)));
    return row && toRepo(row);
  }
}
```

## 3. Optional transaction parameter

```ts
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async insert(input: NewRepo, tx?: Tx): Promise<Repo> {
  const [row] = await (tx ?? this.db).insert(t.repos).values(input).returning();
  return toRepo(row);
}
```

## 4. Thin route

```ts
// GOOD — parse, delegate, map status. Nothing else.
app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
  const { workspaceId, userId } = await getContext(app.container, req);
  const { repo, created } = await app.container.repoService.add(workspaceId, userId, req.body.url);
  reply.status(created ? 201 : 200);
  return repo;
});
```

## 5. Unit test with a fake port

```ts
class InMemoryRepoStore implements RepoStore {
  private items = new Map<string, Repo>();
  async findByFullName(ws: string, fullName: string) {
    return this.items.get(`${ws}/${fullName}`);
  }
  async insert(input: NewRepo) { /* ... */ }
}

it('returns existing repo instead of creating a duplicate', async () => {
  const svc = new RepoService(new InMemoryRepoStore(), fakeGit, fakeJobs);
  // no DB, no Fastify
});
```

## 6. Cross-module access

```ts
// BAD — reaching into another module's internals
import { INDEX_JOB_KIND } from '../repo-intel/constants.js';

// GOOD — via that module's public facade (index.ts) or a port from the container
import { INDEX_JOB_KIND } from '../repo-intel/index.js';
```
