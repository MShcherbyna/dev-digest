# Implementation Plan: Project Context, per-repository attachments (delta)

Spec: `specs/2026-10-11-project-context.md` (Revision 2026-10-11, "per-repository
attachments"). Base: commit `4505022` on `L05-lab` implements the earlier
repo-agnostic version (plan `docs/plans/project-context_en.md`, kept as
history). This plan covers only the delta.

## 1. Goal & scope

**Goal.** Attachment lists move from one list per agent / per skill to one list
per pair (agent, repository) and (skill, repository):

- new tables `agent_repo_context` and `skill_repo_context` (created by
  `pnpm db:generate` only); columns `agents.context_paths` and
  `skills.context_paths` dropped; old data discarded, no migration (user
  decision);
- `GET|PUT /agents/:id/context` and `/skills/:id/context` take a required
  `repo_id` query parameter (missing or malformed: 422; unknown or foreign
  repo, agent or skill: 404; invalid or duplicate paths: 400). Body and response
  stay `{ paths }`;
- run time reads only the lists for the PR's repository (AC-24);
- "Used by N agents" counts lists for the selected repository only (AC-9);
- deleting an agent, skill or repository removes its lists (AC-39, FK cascade);
- client: query keys, hooks and both Context tabs carry the active repo id. A
  repo switch replaces everything (rows, checked state, order, "N of M", tokens,
  SERIALIZES AS, open preview, filter) (AC-37). With no active repo the tabs show
  the hint and no rows. With an uncloned repo they show only that repo's own
  attached paths, marked "not found in <owner/name>" (AC-20, Q1 decided).

**Already done in the current code (no step needed, verified by reading):**
- "N of M attached" on both tabs (`ContextDocList.tsx:50-51`, `list.countOf`);
- SERIALIZES AS box headed `## Project specifications` on both tabs
  (`client/src/components/serializes-as/*`, used by both `ContextTab.tsx`),
  which matches screenshot 20 and Q3 (decided);
- left panel redesign: header shows "PROJECT CONTEXT" plus the repo full name and
  Refresh. Rows show name, directory and area badge (`root` for root files)
  (`FileListPanel.tsx`), which matches screenshot 19;
- `AgentsWorkspace` `VALID_TABS` is derived from the editor's `TABS`
  (`AgentsWorkspace.tsx:19`), covered by `AgentsWorkspace.test.tsx`;
- the tab error state with Retry when the list GET fails (Q2 decided) is
  already rendered by both `ContextTab.tsx` (`ErrorState` + `refetch`).

**Non-goals.**
- Does not change any specification (spec is read-only input).
- No data migration of the old `context_paths` values, no "all repositories"
  list, no copying between repos.
- No change to reviewer-core, the prompt block, the trace contract, the
  discovery endpoint shape, `/repos/:id/context/file`, the vendored contracts or
  the vendored UI.
- No new e2e flow file (the test-writer guard cannot write `e2e/**`; see §9).
- No change to the SERIALIZES AS heading or the prompt heading (Q3 decided).

## 2. Context read

Files read (all absolute under `/Users/mtakumi/Projects/dev-digest/`):
- `specs/2026-10-11-project-context.md` (full, incl. Revision, AC-7/9/12-14/17/20-24/28/30/37-39, edge cases, Contracts, Open questions Q1-Q4).
- `server/docs/project-context.md`; `server/AGENTS.md`; `server/INSIGHTS.md`; `client/AGENTS.md` (via `client/CLAUDE.md`); `client/INSIGHTS.md`; root `INSIGHTS.md`; `reviewer-core/INSIGHTS.md` (nothing relevant); `docs/retros/retro-2026-10-11-project-context-run.md` (lessons).
- Server: `src/modules/project-context/{routes,service,repository,ports,schemas,types,helpers}.ts`; `src/modules/reviews/run-executor.ts:180-270`; `src/db/schema.ts`; `src/db/schema/{agents,skills,repos,context}.ts`; `src/modules/_shared/schemas.ts`; `drizzle.config.ts`; `test/project-context-service.test.ts:1-73`; `test/project-context.it.test.ts:1-195, 337-476`; `test/helpers/pg.ts` (runs migrations).
- Client: `src/lib/hooks/{project-context,keys}.ts`; `src/lib/repo-context.tsx`; `src/components/context-doc-list/{ContextDocList.tsx,helpers.ts,ContextDocList.test.tsx}`; `src/components/serializes-as/{SerializesAs.tsx,helpers.ts}`; both `ContextTab.tsx` + tests; `AgentEditor.tsx`; `AgentsWorkspace.test.tsx`; `SkillDetail.tsx:1-60`; `ProjectContextView.tsx`; `FileListPanel.tsx`; `ProjectContextView/styles.ts` (grep); `messages/en/context.json`.
- Screenshots: `.../3bbced65-.../images/19.png` (left panel) and `20.png` (SERIALIZES AS). Both match the current code; see §10 for 11-16.

Relevant entries (quoted):
- `server/INSIGHTS.md`, Codebase Patterns, 2026-10-11: "project-context status codes: path-rule and duplicate violations are 400 (`BadRequestError` ...), while a malformed body (wrong shape/types) is 422 from the Zod schema, per the repo convention. Don't move path rules into the Zod schema or they become 422."
- `server/INSIGHTS.md`, 2026-10-11: "project-context trace field is module-local: `RunTraceWithContext` ... `reviews/*` imports only the type." (unchanged by this plan)
- `server/INSIGHTS.md`, 2026-09-24: "`*.it.test.ts` suites build `loadConfig(process.env)` ... New review-path LLM/GitHub calls need a test-side override." (no new calls; the existing `makeApp` already overrides all providers)
- `server/AGENTS.md`, Gotchas: "DB does **not** migrate on boot — run `pnpm db:migrate` manually after pulling schema changes."
- `client/INSIGHTS.md`, 2026-09-20: "`@testing-library/user-event` is NOT a client dependency ... component tests use the `fireEvent`-based shim `src/test/user.ts`" and "`src/test/render-intl.tsx`".
- Retro `retro-2026-10-11-project-context-run.md` "Missed": the Context tab was unreachable via `?tab=context` and no test caught it, because tests rendered the leaf only. Step 24 (browser) was skipped because the migration was not applied. The test-writer cannot write e2e flows.

## 3. Affected modules

server
- `src/db/schema/project-context.ts` **new**: tables `agentRepoContext` and `skillRepoContext`.
- `src/db/schema.ts` **modified**: re-export the new file, add both tables to `schema`.
- `src/db/schema/agents.ts`, `src/db/schema/skills.ts` **modified**: remove `contextPaths` (and its comment).
- `src/db/migrations/0016_*.sql` + `meta/0016_snapshot.json` + `meta/_journal.json` **generated** by `pnpm db:generate` (never hand-edited).
- `src/modules/project-context/ports.ts` **modified**: `ProjectContextStore` per-repo signatures, `ResolveForRunInput.repoId`.
- `src/modules/project-context/repository.ts` **modified**: queries on the new tables, upsert, per-repo used-by.
- `src/modules/project-context/schemas.ts` **modified**: new `ContextRepoQuery`.
- `src/modules/project-context/service.ts` **modified**: repo-scoped get/set, 404 for agent/skill/repo, per-repo discover and resolve.
- `src/modules/project-context/routes.ts` **modified**: `querystring: ContextRepoQuery` on the 4 attachment routes.
- `src/modules/reviews/run-executor.ts` **modified**: pass `repoId: repo.id` to `resolveForRun`.
- `test/project-context-service.test.ts`, `test/project-context.it.test.ts` **modified** (test-writer).

client
- `src/lib/hooks/keys.ts` **modified**: `agentContext(id, repoId)`, `skillContext(id, repoId)`.
- `src/lib/hooks/project-context.ts` **modified**: repo-scoped GET/PUT, mutation variables carry `repoId`.
- `src/components/context-doc-list/ContextDocList.tsx` **modified**: no rows without a repo; uncloned repo marks attached rows not-found; stale doc comments.
- `src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.tsx` **modified**.
- `src/app/skills/_components/ContextTab/ContextTab.tsx` **modified**.
- `src/app/repos/[repoId]/context/_components/ProjectContextView/_components/FileListPanel/FileListPanel.tsx` + `ProjectContextView/styles.ts` **modified** (Q4 decided: ellipsis + tooltip on the repo name).
- Tests (test-writer): `ContextDocList.test.tsx`, both `ContextTab.test.tsx`, `AgentEditor.test.tsx`, `SkillDetail.test.tsx`, `ProjectContextView.test.tsx`.

docs (doc-writer): `server/docs/project-context.md`, `server/README.md` (API surface), `client/README.md` (route → API map) if it lists the context calls.

reviewer-core, e2e, mcp: no change.

## 4. Contracts touched

- **HTTP**: `GET|PUT /agents/:id/context?repo_id=<uuid>`, `GET|PUT /skills/:id/context?repo_id=<uuid>`. New required query `repo_id` (Zod `z.string().uuid()`; missing or malformed → 422 by the type provider). Body and response `ContextPaths` `{ paths: string[] }` are unchanged. `GET` for a pair with no row → `{ paths: [] }`. Status codes: 404 unknown or foreign agent, skill or repo; 400 invalid or duplicate paths (service, `BadRequestError`, `details.invalid` / `details.duplicates`).
- **Zod (module-local, `project-context/schemas.ts`)**: new `ContextRepoQuery = z.object({ repo_id: z.string().uuid() })`. `ContextListing.used_by` keeps its shape, but the value is now per repo.
- **DB schema**:
  - `agent_repo_context`: `agent_id uuid NOT NULL → agents.id ON DELETE CASCADE`, `repo_id uuid NOT NULL → repos.id ON DELETE CASCADE`, `paths jsonb NOT NULL DEFAULT '[]'` (typed `string[]`, ordered), `updated_at timestamptz NOT NULL DEFAULT now()`; PK `(agent_id, repo_id)`; index `agent_repo_context_repo_idx` on `(repo_id)`.
  - `skill_repo_context`: same columns with `skill_id → skills.id ON DELETE CASCADE`; PK `(skill_id, repo_id)`; index `skill_repo_context_repo_idx` on `(repo_id)`.
  - `agents.context_paths` and `skills.context_paths` are dropped.
- **Application types / ports**: `ProjectContextStore` changes (see step S4); `ResolveForRunInput` gains `repoId: string`.
- **Client**: `ContextPaths`/`ContextListing` types in `client/src/lib/types.ts` unchanged. Query keys and hook signatures change (step C1-C2).
- **Vendored copies**: none involved. `vendor/shared` is not touched: the agent/skill/trace contracts never carried `context_paths`.

## 5. Skills for implementer

| Skill | Governs | Key rules for this task |
|---|---|---|
| drizzle-orm-patterns | S1-S3, S5 | Explicit snake_case names on every column/index; FK via arrow fn with `onDelete: 'cascade'`; upsert with `onConflictDoUpdate({ target: [pk cols] })`; migration only through `pnpm db:generate`. |
| postgresql-table-design | S1 | Composite PK on the natural key; **index the FK column not covered by the PK prefix** (`repo_id`); `timestamptz`; `NOT NULL` + default for `paths`. |
| onion-architecture | S4-S9 | `drizzle-orm` and `t.*` only in `repository.ts`; repository returns plain `string[]` / `UsedByRow[]`, never rows; service gets the narrow `ProjectContextStore` port; routes parse, call one service method, no rules. |
| fastify-best-practices | S8 | Declare `querystring` schema on the route (Zod type provider) instead of reading `req.query` untyped; errors thrown by the service, mapped centrally. |
| zod | S6, S8 | Shape checks (uuid `repo_id`, array/length) stay in Zod → 422; path rules stay in the service → 400 (server INSIGHTS 2026-10-11). |
| security | S5, S7, S8 | Every id (agent, skill, `repo_id`) is checked against the caller's workspace before any read/write; `repo_id` never selects the clone read at run time (the PR's repo does). |
| react-frontend-architecture | C1-C6 | Server data stays in the query cache keyed by repo id (never copied into state); data access only through `lib/hooks`; reset local UI state by remounting (`key`) instead of effects. |
| react-best-practices | C3-C6 | No `useEffect` to "clear on repo switch"; use a `key` and derived values. |
| react-testing-library | T3-T7 | Query by role/name; `src/test/user.ts` shim (no user-event); mock at the `@/lib/api` boundary so the real hooks run; test parent containers through their URL/state. |

## 6. Architecture constraints

- Keep `routes.ts → service.ts → repository.ts`. The new tables are accessed only from `project-context/repository.ts`. Other modules (`agents`, `skills`, `repos`) are **not** changed: cleanup on delete is done by FK `ON DELETE CASCADE`, so no cross-module repository calls are needed.
- `service.ts`, `ports.ts`, `types.ts`: no `drizzle-orm`, `fastify` or `zod` imports.
- `run-executor.ts` keeps depending on the `ProjectContextResolver` port only. It passes `repo.id` (the PR's repo row already in scope at `run-executor.ts:180`).
- Do-not-touch that applies: `server/src/db/migrations/**` (generated only; read the generated SQL, never edit it), `*/vendor/shared/**`, `client/src/vendor/ui/**`, lockfiles.
- Client naming: no new component folders. The existing PascalCase folders and the `index.ts` re-exports stay.
- Tests co-located, same base names (existing files are extended).
- `pnpm db:migrate` is blocked for agents by `implementer-guard.sh` / `test-writer-guard.sh`. The user runs it (see §8 "Manual by the user").

## 7. Steps

Owner tags: **[impl-S]** implementer lane S (server), **[impl-C]** implementer
lane C (client), **[test]** test-writer, **[check]** check-runner, **[review]**
architecture-reviewer || plan-verifier, **[doc]** doc-writer, **[user]** the user.
Lane S and lane C are independent and **can run in parallel**: the HTTP contract
is fixed by the spec, and the client does not import server code.

### Lane S: server (implementer)

**S1 [impl-S]**: `server/src/db/schema/project-context.ts` (new). Define
`agentRepoContext = pgTable('agent_repo_context', …)` and
`skillRepoContext = pgTable('skill_repo_context', …)` with the columns, PKs and
indexes from §4. `paths` is `jsonb('paths').$type<string[]>().notNull().default([])`.
`updatedAt` is `timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()`.
FKs use `() => agents.id` / `() => skills.id` / `() => repos.id` with
`{ onDelete: 'cascade' }`. Import from `./agents`, `./skills`, `./repos`. Add a
file header comment: per-(agent|skill, repo) ordered path lists, paths only,
outside version snapshots (AC-23, AC-38). Skills: drizzle-orm-patterns,
postgresql-table-design.

**S2 [impl-S]**: `server/src/db/schema.ts`: add `export * from './schema/project-context';`,
import both tables and add them to the `schema` object (after `agentSkills`).
`server/src/db/schema/agents.ts:33-35` and `server/src/db/schema/skills.ts:20-21`:
remove the `contextPaths` column and its comment. Skill: drizzle-orm-patterns.

**S3 [impl-S]**: in `server/` run `pnpm db:generate` (on this machine
`npx --yes pnpm@10 db:generate` if `pnpm` is not on PATH, root INSIGHTS
2026-09-18). Generation diffs the schema against the last snapshot and does not
need the database. **Read** the generated `0016_*.sql` and confirm it contains
only:
- two `CREATE TABLE`;
- the FK constraints with `ON DELETE cascade`;
- the two `CREATE INDEX`;
- `ALTER TABLE "agents" DROP COLUMN "context_paths"`;
- `ALTER TABLE "skills" DROP COLUMN "context_paths"`.

There must be no data copy and no rename. If drizzle-kit asks an interactive
rename question, answer "create new table" / "drop column" (no rename). If that
is impossible non-interactively, stop and report. Never edit the generated
files. Report to the caller: **the user must run `pnpm db:migrate` in
`server/` and restart the API** (§8). Skill: drizzle-orm-patterns.

**S4 [impl-S]**: `server/src/modules/project-context/ports.ts`. Replace the
store port with:
- `getRepo(workspaceId, repoId)` (unchanged);
- `agentExists(workspaceId, agentId): Promise<boolean>`;
- `skillExists(workspaceId, skillId): Promise<boolean>`;
- `getAgentPaths(agentId, repoId): Promise<string[]>` (empty array when no row);
- `setAgentPaths(agentId, repoId, paths): Promise<string[]>` (whole-list replace, upsert);
- `getSkillPaths(skillId, repoId): Promise<string[]>`;
- `setSkillPaths(skillId, repoId, paths): Promise<string[]>`;
- `usedByRows(workspaceId, repoId): Promise<UsedByRow[]>`;
- `skillPathsFor(skillIds, repoId): Promise<Map<string, string[]>>`.

Add `repoId: string` to `ResolveForRunInput` (doc: "the PR's repository; only
its lists are read, AC-24"). Update the port doc comment ("writes touch only the
per-repo list tables; no version bump, AC-23"). Skill: onion-architecture.

**S5 [impl-S]**: `server/src/modules/project-context/repository.ts`. Implement
the new port. The SQL lives here only:
- `agentExists` / `skillExists`: select id where `workspaceId` and `id` match.
- `getAgentPaths`: select `paths` from `agentRepoContext` where `agentId` and
  `repoId` match, returning `row?.paths ?? []`. `getSkillPaths` is the same on
  `skillRepoContext`.
- `setAgentPaths`: `insert(agentRepoContext).values({ agentId, repoId, paths })`
  with `.onConflictDoUpdate({ target: [agentId, repoId], set: { paths, updatedAt: new Date() } })`
  and `.returning({ paths })`. Empty lists are stored as `[]` (no delete). Skills
  are the same.
- `usedByRows(ws, repoId)`:
  - direct: `agentRepoContext` inner join `agents` (ws filter), where
    `agentRepoContext.repoId = repoId`;
  - via skills: `agentSkills` join `skills` join `agents` inner join
    `skillRepoContext` on `skillId = skills.id AND skillRepoContext.repoId = repoId`,
    keeping both `enabled` flags and the ws filters of the current query.
  - Return `{ agentId, paths }[]`. The pure `countUsedBy` helper is unchanged.
- `skillPathsFor(ids, repoId)`: `inArray(skillId, ids)` and `repoId` match,
  returned as a map. Return `new Map()` early for empty `ids` (keep).

Skills: drizzle-orm-patterns, onion-architecture.

**S6 [impl-S]**: `server/src/modules/project-context/schemas.ts`. Add
`export const ContextRepoQuery = z.object({ repo_id: z.string().uuid() });` with
a comment: "required; missing or malformed → 422 (shape). Unknown or foreign →
404 in the service (AC-30)". No path rules in Zod. Skill: zod.

**S7 [impl-S]**: `server/src/modules/project-context/service.ts`.
- `getAgentContext(workspaceId, agentId, repoId)` and
  `getSkillContext(workspaceId, skillId, repoId)`:
  1. 404 `Agent not found` / `Skill not found` unless `agentExists` / `skillExists`;
  2. 404 `Repository not found` unless `getRepo(workspaceId, repoId)`;
  3. return `{ paths: await getAgentPaths(agentId, repoId) }`.
- `setAgentContext(workspaceId, agentId, repoId, body)` and
  `setSkillContext(…)`: the same two 404 checks, then `validatePaths(body.paths)`
  (400), then the store set. The 404 checks run before path validation, so a
  foreign id never leaks validation details. Nothing is written on any error.
- `discover`: `store.usedByRows(workspaceId, repoId)` (AC-9).
- `resolveForRun`: `store.getAgentPaths(input.agentId, input.repoId)` and
  `store.skillPathsFor(ids, input.repoId)`. Everything else (merge, skip
  reasons, logs) is unchanged.
- Update the doc comments.

Skills: onion-architecture, security.

**S8 [impl-S]**: `server/src/modules/project-context/routes.ts`. Add
`querystring: ContextRepoQuery` to the four `/agents/:id/context` and
`/skills/:id/context` routes and pass `req.query.repo_id` to the service. Update
the header comment (`?repo_id=` required; 422 / 404 / 400). The discovery and
file routes are unchanged. Skills: fastify-best-practices, zod.

**S9 [impl-S]**: `server/src/modules/reviews/run-executor.ts:239-247`. Add
`repoId: repo.id` to the `resolveForRun` input. The comment becomes "Project
context: the PR repo's lists only (AC-24), agent docs then skill docs". Skill:
onion-architecture.

**S10 [impl-S]**: in `server/`, run `pnpm typecheck` to catch every remaining
`contextPaths` reference. The known one is `test/project-context.it.test.ts:467`,
which is test-writer territory: leave it failing to compile and list it in the
report for T2. Do not run the full test suite (check-runner does).

### Lane C: client (implementer, parallel with lane S)

**C1 [impl-C]**: `client/src/lib/hooks/keys.ts:19-20`. Change to
`agentContext: (id, repoId) => ["agent-context", id, repoId] as const` and
`skillContext: (id, repoId) => ["skill-context", id, repoId] as const`, with a
comment: "per (agent|skill, repo); a repo switch is a different key, so a
previous repo's list is never shown (AC-37)". Skill: react-frontend-architecture.

**C2 [impl-C]**: `client/src/lib/hooks/project-context.ts`.
- `useAgentContext(id, repoId)` / `useSkillContext(id, repoId)`: URL
  `/agents/${id}/context?repo_id=${encodeURIComponent(repoId)}`, key from C1,
  `enabled: !!id && !!repoId`. No `placeholderData` / keep-previous: stale data
  from another repo must never render.
- `useSetContextPaths(kind, id)`: mutation variables `{ repoId: string; paths: string[] }`.
  Build the URL **and** the cache key from the variables inside `mutationFn`,
  `onMutate`, `onError` and `onSettled`, never from the hook's closure. A toggle
  in flight during a repo switch then writes, rolls back and invalidates the repo
  that was active when the user toggled (spec edge case "Repository switched
  while a toggle is in flight").
- `onSettled` also invalidates `queryKeys.context(variables.repoId)` (used-by).
- The error toast stays with the global mutation handler (unchanged).
- `useSetAgentContext(id)` / `useSetSkillContext(id)` drop the `repoId`
  argument.
- Update the file header comment.

Skills: react-frontend-architecture, react-best-practices.

**C3 [impl-C]**: `client/src/components/context-doc-list/ContextDocList.tsx`.
- Rows: when `repo` is null, rows are `[]` (AC-20: no rows, no toggles). When the
  listing is loaded and `cloned === false`, pass `[]` as the known files to
  `buildRows`. Every attached path is then a `not_found` row ("not found in
  <owner/name>"), detachable and reorderable (AC-20, **Q1 decided: yes**).
- Otherwise behaviour is unchanged.
- Fix the stale prop comment on `variant` (both variants now show "N of M";
  `variant` only selects the labelled Preview button vs the eye icon) and the
  `children` comment (SERIALIZES AS on both tabs).
- `buildRows` in `helpers.ts` keeps its signature. Its "files undefined → unknown"
  branch is then unused by this component, so leave it and its test as they are.

Skill: react-best-practices.

**C4 [impl-C]**: agent `ContextTab.tsx`.
- `const repoId = activeRepo?.id ?? null`; `q = useAgentContext(agent.id, repoId)`;
  `save = useSetAgentContext(agent.id)`.
- **No repo:** render `ContextDocList` with `repo={null}`, `attached={[]}` and
  `SerializesAs paths={[]}`, without waiting on `q` (the query is disabled, so
  the current `if (!q.data) Skeleton` would spin forever).
- **With a repo:**
  - error state: keep the existing `ErrorState` with Retry and no rows or
    toggles (**Q2 decided**);
  - then the skeleton, then the list;
  - render `<ContextDocList key={repoId ?? "none"} …>` so filter, drag state and
    an open preview reset on a repo switch (AC-37) without an effect.
- `onChange={(paths) => save.mutate({ repoId, paths })}`, only when `repoId` is
  set.
- The SERIALIZES AS heading stays `## Project specifications` (**Q3 decided**,
  no change).

Skills: react-frontend-architecture, react-best-practices.

**C5 [impl-C]**: skill `ContextTab.tsx`. Same changes as C4 with
`useSkillContext` / `useSetSkillContext`.

**C6 [impl-C]** (**Q4 decided: yes**):
- `ProjectContextView/styles.ts` `repoName`: single line with
  `overflow: hidden`, `textOverflow: ellipsis`, `whiteSpace: nowrap`, replacing
  `overflowWrap: anywhere`. Give the header's text wrapper `minWidth: 0` (and
  `flex: 1`) so the ellipsis can engage next to the Refresh button.
- `FileListPanel.tsx:34`: add `title={repoName}` (tooltip). The full
  `owner/name` stays as the element's text content, so it remains the accessible
  name even when visually truncated.

No visual change for names that fit (screenshot 19). Skill: react-best-practices.

**C7 [impl-C]**: in `client/`, run `pnpm typecheck` and fix callers of the
changed hook signatures. Known callers: the two ContextTabs only (grep
`useSetAgentContext\|useSetSkillContext\|useAgentContext\|useSkillContext\|agentContext(\|skillContext(`).
Existing tests that assert the old URLs fail; list them for test-writer, don't
rewrite tests.

### Tests (test-writer, after both lanes)

**T1 [test]**: `server/test/project-context-service.test.ts`. Rework `FakeStore`
to key lists by `(id, repoId)`, with `agentExists`/`skillExists` and repos per
workspace. Cases:
- **AC-38:** set for repo A and B; get A → [a], B → [b], C → [].
- **AC-30:**
  - unknown agent/skill → 404;
  - unknown or foreign `repoId` → 404, and nothing written;
  - invalid/duplicate paths → 400 with details, and nothing written;
  - foreign agent combined with invalid paths → 404 (check order).
- **AC-24:** `resolveForRun` with repoId A ignores lists stored for repo B (agent
  and skill).
- **AC-9:** `discover` passes the repoId to `usedByRows` (fake returns
  per-repo rows).

**T2 [test]**: `server/test/project-context.it.test.ts`.
- `putCtx` / GET helpers take a `repoId` and send `?repo_id=`.
- Replace the direct `t.agents.contextPaths` write (line ~467) with an insert
  into `t.agentRepoContext` for the PR's repo.
- New or changed cases:
  - **AC-30:**
    - missing `repo_id` → 422 and malformed (`repo_id=abc`) → 422, for
      GET and PUT on agents and skills;
    - unknown `repo_id` → 404, and another workspace's repo → 404;
    - after the rejected writes, the stored lists are unchanged.
  - **AC-38:** PUT [a] for repo A and [b] for repo B on one agent (and one
    skill); GET A/B/C → [a]/[b]/[].
  - **AC-23:** version and version history are unchanged after
    `PUT …?repo_id=`.
  - **AC-9:** in repo A, these attach the same path, and the expected
    `used_by` = 2:
    - one direct agent;
    - one agent via an enabled skill;
    - one via a disabled skill link;
    - one agent attaching it only in repo B.
  - **AC-24:**
    - repo A run includes agent [a,b] + skill [b,c] → a,b,c;
    - the agent's list [x] and the skill's list [y] for repo B do not appear
      in the prompt or trace;
    - an agent with lists only for repo B gets no `## Project context` and
      `specs: null` on a repo A PR.
  - **AC-39:**
    - `DELETE /repos/:idA` removes repo A rows from both tables and keeps
      repo B rows;
    - `DELETE /agents/:id` and `DELETE /skills/:id` remove all their rows.
  - **Storage removed:** `information_schema.columns` has no
    `context_paths` on `agents` or `skills`.
- Keep the existing AC-1…36 cases green, adapted to `repo_id`.

**T3 [test]**: `client/src/components/context-doc-list/ContextDocList.test.tsx`.
Rewrite the AC-20 case:
- `repo={null}` with attached paths → hint, zero list items, zero checkboxes;
- uncloned listing → hint plus each attached path as a row with "not found in
  acme/api", still detachable (click → `onChange` without it) (Q1).

**T4 [test]**: agent `ContextTab.test.tsx`. Make the `useActiveRepo` mock
mutable (hoisted state) and use the real hooks with the `api` mock keyed by URL.
- GET is `/agents/ag1/context?repo_id=r1` and PUT is
  `/agents/ag1/context?repo_id=r1` with the full list (AC-14). Update the
  existing assertions.
- **AC-37:** the r1 list has `specs/a.md`, the r2 list is empty, and both
  listings contain `specs/a.md`. Rerender with r2: `specs/a.md` is unchecked,
  "0 of M attached", the SERIALIZES AS box is the heading only, the token
  total is 0. Switch back to r1: checked again, "1 of M".
- **In-flight toggle:** a pending PUT on r1, then switch to r2. The r2 view is
  unaffected, the PUT URL carries `repo_id=r1`, and rejecting it leaves r2
  unchanged.
- **AC-20:** `activeRepo: null` → hint, no rows, and no GET to `/agents/…`.
- **Q2:** a failing list GET for the active repo → error message plus Retry,
  no rows. Retry re-requests the list with `repo_id`.

**T5 [test]**: skill `ContextTab.test.tsx`: `repo_id` in the GET/PUT URLs, plus
the AC-37 switch case (rows, badge, SERIALIZES AS).

**T6 [test]**: parent containers through their URL/state (retro lesson).
- `AgentEditor.test.tsx`: render `AgentEditor` with `tab="context"` and an active
  repo, with the real ContextTab and the `api` mock. Assert that the "Project
  context" heading renders and the GET carried `repo_id`.
- `SkillDetail.test.tsx`: with `?tab=context`, the "Project context to use" tab
  renders through `SkillDetail`, and the GET carries `repo_id`.
- `AgentsWorkspace.test.tsx` already covers `?tab=context`; keep it.

**T7 [test]**: `ProjectContextView.test.tsx` (Q4). The repo name in the left
panel header carries a `title` with the full `owner/name`, and its accessible
text is the full name. The existing area-badge/header assertions stay.

**T8 [test]**: e2e for AC-37/AC-21 is **not assignable** in this workflow
(`test-writer-guard.sh` blocks `e2e/**` writes, per the retro). Replace it with
T4-T6 plus the manual browser check in §8. Record the gap in the report.

### Verification, review, docs

**V1 [check]**: the commands in §8 for server and client (reviewer-core
unchanged, so it is not run). Integration tests use Testcontainers, which
applies migrations itself (`test/helpers/pg.ts` → `runMigrations`), so they do
not need the user's `db:migrate`.

**V2 [review]**: architecture-reviewer || plan-verifier, in parallel. See §9
for what to scrutinise.

**V3 [doc]**: doc-writer.
- `server/docs/project-context.md`:
  - "What it is" storage paragraph → the new tables plus migration 0016;
  - the Attachments section → `?repo_id=` and the 422/404/400 table rows;
  - the mermaid nodes `agents/skills.context_paths` → the per-repo tables;
  - Run-time flow `resolveForRun({agentId, repoId, …})`;
  - `used_by` per repo;
  - "Apply the migration": 0016.
- `server/README.md`: API surface lines for the four context routes.
- `client/README.md`: route → API map, if it lists the context calls.

**U1 [user]**: after S3 has produced the migration and before any browser check:
`cd server && pnpm db:migrate`, then restart the API (`pnpm dev` in `server/`).
Agents cannot run `db:migrate` (hook). Until it runs, the running API fails on
the dropped or missing columns and tables.

## 8. Acceptance checks

Server (`cd server`):
- `pnpm typecheck`
- `pnpm test` (unit + integration; Docker must be running for `*.it.test.ts`)
- Focused: `npx vitest run test/project-context-service.test.ts test/project-context.it.test.ts test/project-context-helpers.test.ts test/project-context-fs.test.ts`
- Migration sanity (read-only): `ls src/db/migrations/ | tail -3` shows one new `0016_*.sql`. The SQL contains the two `CREATE TABLE`, the two `DROP COLUMN "context_paths"` and no `INSERT`/`UPDATE`.

Client (`cd client`):
- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`
- Focused: `npx vitest run src/components/context-doc-list src/app/agents src/app/skills src/app/repos/[repoId]/context`

Manual by the user (U1): `cd server && pnpm db:migrate`, then restart the API.

Browser checks (after U1; API :3001, web :3000), with two connected repos A and B
that both contain `specs/a.md`:
1. Agent editor `/agents/<id>?tab=context` with repo A active: attach
   `specs/a.md`. The badge shows "1 of M attached", SERIALIZES AS shows
   `## Project specifications` / `- specs/a.md`, and the token total updates.
2. Switch the repo switcher to B: `specs/a.md` is unchecked, "0 of M attached",
   SERIALIZES AS is the heading only, and the token total is 0. Switch back to A:
   checked again (AC-37).
3. Same on the skill editor `/skills/<id>?tab=context` (AC-21, AC-37).
4. Project Context page for A: the attached doc shows "Used by 1 agent". For B:
   "Used by 0 agents" (AC-9).
5. With a repo that has no clone: the tab shows the not-cloned hint and only that
   repo's attached rows, marked "not found in owner/name", detachable (AC-20,
   Q1).
6. Network tab: every `/agents|skills/:id/context` call carries `?repo_id=`. A
   call without it (curl `GET /agents/<id>/context`) returns 422.
7. Run a review on a PR of repo B for an agent that has docs attached only in
   repo A. The trace "Specs read" shows "none" (AC-24).
8. The left panel header shows the repo full name, with an ellipsis for a long
   name and the full name as a tooltip (Q4). Rows match screenshot 19.

## 9. Risks & open questions

Spec Q1-Q4 were answered by the user (relayed by the main session); all are
**DECIDED** and the steps use them. No open questions remain from the spec:
- **Q1 DECIDED: yes.** An active but uncloned repository lists its own attached
  paths, marked "not found in <owner/name>", detachable (C3, T3, browser
  check 5).
- **Q2 DECIDED: error message with Retry**, like the page's AC-11 state. No rows
  or toggles until it loads. This is already rendered by both ContextTabs and
  kept per repo (C4/C5, T4).
- **Q3 DECIDED: follow the screenshot.** The SERIALIZES AS heading is
  `## Project specifications`; the prompt heading `## Project context` is
  unchanged. Already implemented; no step changes it.
- **Q4 DECIDED: yes.** A long repository name is truncated with an ellipsis,
  with the full `owner/name` as tooltip and accessible name (C6, T7, browser
  check 8).

Risks:
- **Running API before U1.** After the S1-S3 code lands, the dev API (tsx watch
  hot-reloads) queries tables that do not exist until `pnpm db:migrate` runs, so
  context endpoints and runs fail. Runs stay fail-soft (the resolver catch in
  `run-executor.ts:248`), but the tabs show an error. Mitigation: U1 immediately
  after lane S.
- **drizzle-kit interactivity.** `db:generate` can prompt for renames when it
  sees drops and creates together. Here, columns are dropped from tables that
  gain no columns and new tables appear with none dropped, so no prompt is
  expected. If one appears, S3 says: no rename, stop if non-interactive.
- **Check-then-write race.** The agent/repo existence checks and the upsert are
  separate statements. A concurrent delete of the agent or repo makes the upsert
  hit an FK violation (500 instead of 404). It is rare and harmless (no data
  written). Accepted; flag for the architecture review.
- **No `workspace_id` on the new tables.** This follows the `agent_skills`
  precedent; workspace scoping is via `agents`/`skills`/`repos`. This conflicts
  with the `schema.ts` header text "every domain table carries workspace_id".
  The architecture reviewer should confirm that junction-style tables are
  exempt.
- **jsonb ordered list vs. row-per-path.** A jsonb `string[]` per pair keeps
  whole-list replace atomic (one upsert) and matches the existing helpers. The
  cost is that used-by is aggregated in JS (as today), not in SQL. A
  row-per-path table with a `position` column would allow SQL counting but needs
  delete+insert in a transaction per write. Chosen: jsonb.
- **TanStack mutation closure.** If C2 builds keys from the hook closure instead
  of the variables, an in-flight toggle during a switch rolls back the wrong
  repo's cache. T4's in-flight case catches it.
- **e2e gap.** AC-12/21/37 list e2e as verification. No agent can write it (T8).
  The browser checks in §8 are the substitute, and the main session or the user
  must perform them.

For reviewers to scrutinise:
- architecture-reviewer: no drizzle in service/ports; the repository returns
  plain arrays; cascade-based cleanup instead of cross-module calls; route
  `querystring` schema; the two risks above (race, workspace_id).
- plan-verifier: AC-9/13/14/17/20/22/23/24/28/30/37/38/39 coverage. Check that
  every context call site carries `repo_id` (grep `"/context"` in
  `client/src/lib/hooks`). `?tab=context` reachability on both editors (T6).
  The migration is generated and not hand-edited.

## 10. Could not determine

- The screenshots 11, 12, 13, 14 and 16 (earlier session) were not re-read in
  this pass; only 19 and 20 were. Their content (tab layouts, trace drawer) is
  unchanged by this delta, and the current code already reflects the user's
  later corrections (N of M on both tabs, SERIALIZES AS on both). No UI step
  here adds visuals, so no step is blocked on design.
- I did not confirm whether drizzle-kit 0016 generation is fully
  non-interactive on this machine (S3 handles both outcomes).
- I did not read `SkillDetail.test.tsx`, `AgentEditor.test.tsx` and
  `ProjectContextView.test.tsx` in full. T6/T7 extend them; the test-writer must
  adapt to their existing mocks.
- I did not verify whether `client/README.md` lists the context endpoints (V3
  says "if").
- The git snapshot shows only the spec modified in the working tree. I assumed
  every UI edit named by the caller (left panel, SerializesAs, N of M on skills,
  VALID_TABS) is committed; the code I read confirms all four are present.

## 11. Requirements review

Questions and answers (relayed from the user by the main session, quoted):
- Execution mode: "execution mode is multi-agent (implementer -> test-writer -> check-runner -> architecture-reviewer || plan-verifier -> doc-writer, run via /run-plan)".
- Data: "no data migration; per-repo storage".
- Spec Q1: "yes (an active but not cloned repository still lists that repository's own attached paths, marked not found, so they can be detached)". **DECIDED**, used in C3/T3.
- Spec Q2: "error message with Retry, like the page's AC-11 state". **DECIDED**, used in C4/C5/T4.
- Spec Q3: "follow the screenshot (SERIALIZES AS box heading `## Project specifications`, prompt heading unchanged)". **DECIDED**, no step (already implemented).
- Spec Q4: "yes (truncate a long repository name with an ellipsis, full owner/name in a tooltip and the accessible name)". **DECIDED**, used in C6/T7.

Gaps/conflicts found:
- **AC-20 vs. current code.** With no repo the current tab still lists attached
  paths (`ContextDocList.test.tsx` "AC-20" case asserts this), and with an
  uncloned repo it shows no "not found" marker. The amended AC-20 (with Q1)
  requires zero rows without a repo and not-found rows when uncloned. Fixed by
  C3/T3.
- **Endless skeleton without a repo.** Once the GET requires `repo_id`, the
  context query is disabled when no repo is active, and the current
  `if (!q.data) Skeleton` would spin forever. Fixed by C4/C5.
- **Repo name wraps instead of truncating.** The left-panel repo name currently
  wraps (`overflowWrap: anywhere`); Q4 asks for an ellipsis. Fixed by C6.
- **`schema.ts` tenancy header vs. junction-table precedent.** See §9.
- **AC-37's e2e verification cannot be produced by the workflow agents.** See
  §9/T8.
- **Stale doc comment** in `ContextDocList.tsx:23` ("skill: 'N attached'").
  Fixed in C3.

Recommendations (accept/reject is the user's; these do not change scope):
1. **Remount on repo switch via `key`** rather than effects (C4/C5). Trade-off:
   it also drops the filter text on a switch, which is consistent with "clear
   everything". Applied as part of the AC-37 implementation.
2. **Derive mutation URL/key from variables** (C2). Trade-off: callers pass
   `{ repoId, paths }` instead of `paths`. It is needed for the in-flight edge
   case. Applied.
3. **Cascade-only cleanup** (no changes in `agents`/`skills`/`repos` modules).
   Trade-off: it relies on DB FKs, so it is covered by the T2 AC-39 test.
   Applied.
4. **A small e2e owner fix** (root cause of T8): allow the test-writer guard to
   write `e2e/**/*.flow.json` in a separate workflow change. Not part of this
   plan; for the user to decide.

## 12. Execution mode

**multi-agent** (user's choice, quoted: "execution mode is multi-agent
(implementer -> test-writer -> check-runner -> architecture-reviewer ||
plan-verifier -> doc-writer, run via /run-plan)").

Sequence:
1. Two implementer lanes in parallel, in one message:
   - **Lane S:** S1-S10, server. It ends by reporting "user must run
     `pnpm db:migrate` + restart API".
   - **Lane C:** C1-C7, client.
2. **U1 (user):** `pnpm db:migrate` in `server/`, restart the API. This can
   happen while tests are being written.
3. **test-writer:** T1-T7 (T8 recorded as a gap). If the turn budget is tight,
   split into two parallel test-writers: server (T1-T2) and client (T3-T7).
4. **check-runner:** V1.
5. **architecture-reviewer || plan-verifier:** V2, in parallel.
6. Fix loop if needed: implementer, then check-runner, then narrow reviews.
7. **doc-writer:** V3.
8. **Main session / user:** the browser checks in §8 (after U1).
