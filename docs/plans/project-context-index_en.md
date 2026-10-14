# Implementation Plan: Project Context index (file manifest + chunks)

Spec: `specs/2026-10-13-project-context-index.md` (SPEC-2026-10-13-project-context-index),
amending `specs/2026-10-11-project-context.md`. Design: screenshot 41 (left-panel
header) and screenshot 42 (left-panel footer); fallback `design/DevDigest Design (standalone) (3).html`, screen N6.

## 1. Goal & scope

**Goal.** For each repository, the server keeps a persisted Project Context index:
- a file manifest;
- heading-based chunks with SHA-256 hashes;
- an index state.

The index is built from the clone by a background job. That job is started by the new `POST /repos/:repoId/context/reindex` and automatically after every successful clone job (initial clone and the refresh fetch). `GET /repos/:repoId/context` answers from the index and carries an `index` object and a `stale` flag. The Project Context left panel changes:
- the refresh button becomes a Re-index icon button;
- the footer shows "Indexed: N files · M chunks" on line 1 and "last <rel>" on line 2, plus " · out of date";
- new states: indexing, not indexed, not cloned, and failure toasts.

**Non-goals.**
- Does not change any specification. Spec files are read-only input.
- No embeddings, vector search or retrieval, and no LLM or network call while indexing.
- No change to what runs and PR Brief read. `resolveForRun`, `resolveForBrief` and `readFile` keep reading the clone (old AC-24 to AC-29, old AC-8/11/18).
- No chunk browsing endpoint or UI. Only the count is shown.
- No New file / New folder / Upload / Download controls (AC-19). No change to the header subtitle: it stays the repository name (old AC-7).
- No change to the Agent and Skill Context tabs beyond their listing type and test fixtures.
- No incremental-index contract: every job is a full rebuild.
- No backfill on deploy.
- No change to the repo-intel resync (Q6 = keep AC-10 literal).
- No e2e package changes (Q9).
- No edits to `*/vendor/shared/**`, `client/src/vendor/ui/**`, migrations by hand, or lockfiles.

## 2. Context read

Files read:
- Root `CLAUDE.md`; `server/AGENTS.md`; `client/AGENTS.md`; root, `server/` and `client/` `INSIGHTS.md`.
- Both specs, in full.
- Server: `server/src/modules/project-context/{service,routes,ports,schemas,types,helpers,constants,repository}.ts`; `server/src/adapters/repo-docs/fs.ts`; `server/src/adapters/mocks.ts` (MockRepoDocsSource, MockGitClient.currentHead); `server/src/platform/{jobs,resilience,container}.ts`; the `app.ts` error handler; `server/src/modules/repos/service.ts`; `server/src/modules/repo-intel/{routes,service}.ts`; `server/src/modules/onboarding/service.ts` (in-flight map + `not_cloned` 409 precedent); `server/src/db/schema.ts`; `server/src/db/schema/{project-context,repo-intel,context}.ts`; `server/test/project-context.it.test.ts` (head); `server/README.md` (Project Context endpoints table).
- Client: `client/src/app/repos/[repoId]/context/_components/ProjectContextView/{ProjectContextView.tsx,helpers.ts,styles.ts}`; `.../_components/FileListPanel/FileListPanel.tsx`; `client/src/lib/hooks/{project-context,repo-intel}.ts`; `client/src/lib/types.ts`; `client/src/lib/providers.tsx`; `client/src/vendor/ui/primitives/IconBtn.tsx`; `client/src/components/context-doc-list/ContextDocList.tsx`; `client/messages/en/context.json`.
- Skills: onion-architecture, fastify-best-practices, drizzle-orm-patterns, postgresql-table-design, zod, react-frontend-architecture, react-best-practices, react-testing-library, security.

Relevant INSIGHTS entries (quoted):
- `server/INSIGHTS.md` 2026-10-11: "the project-context fs adapter fails closed ... every path segment is `lstat`-checked ... Do not 'simplify' it to a single realpath-prefix check."
- `server/INSIGHTS.md` 2026-10-11: "path-rule and duplicate violations are 400 ... while a malformed body ... is 422 from the Zod schema."
- `server/INSIGHTS.md` 2026-10-12: "`server/tsconfig.json` has `include: ["src/**/*.ts"]`, so `pnpm typecheck` never type-checks `server/test/**`."
- `server/INSIGHTS.md` 2026-10-12: flaky `.it` race in `run-executor.ts` (status flipped before `saveRunTrace`). Expect it in the AC-12 regression runs; it is pre-existing.
- `client/INSIGHTS.md` 2026-10-02: "Resync completion is the index state's `updatedAt` advancing, not `POST /repos/:id/resync` returning (it is 202 ...)."
- `client/INSIGHTS.md` 2026-10-12: "`ToastProvider` registers its pusher in an effect ... a component that toasts on its first commit toasts into the void ... the `rerender` returned by `renderWithIntl` drops the providers."
- `client/INSIGHTS.md` 2026-10-12: "`vitest run <path>` treats its argument as a regex filter ... Filter by base name instead."
- `client/INSIGHTS.md` 2026-09-20: "`@testing-library/user-event` is NOT a client dependency ... component tests use the `fireEvent`-based shim `src/test/user.ts`."
- Root `INSIGHTS.md` 2026-09-18: `pnpm` is not on PATH; use `npx --yes pnpm@10 <cmd>`. Docker Desktop must be running for Postgres / Testcontainers.

## 3. Affected modules

**server/**
- `src/db/schema/project-context.ts` (modified): new tables `contextIndexState`, `contextFiles`, `contextChunks`.
- `src/db/schema.ts` (modified): add the three tables to the `schema` object (the barrel `export *` already re-exports the file).
- `src/db/migrations/**` (generated only, via `pnpm db:generate`).
- `src/modules/project-context/domain/chunking.ts` (new): pure heading chunker.
- `src/modules/project-context/indexer.ts` (new): builds one index (manifest + chunks + hashes) from the ports. No persistence.
- `src/modules/project-context/ports.ts` (modified): `RepoDocsSource.readRaw` and `isDirectory`; `CloneHead`; `ContextIndexStore`; `IndexJobs`; `ProjectContextLog.info`.
- `src/modules/project-context/types.ts` (modified): listing, index info, reindex response, manifest/chunk/build records.
- `src/modules/project-context/schemas.ts` (modified): Zod `ContextListing` (no `scanned_at`; `stale`, `index`) and `ReindexAccepted`.
- `src/modules/project-context/constants.ts` (modified): chunk cap, job kind, failure reasons, insert batch size.
- `src/modules/project-context/helpers.ts` (modified): `sha256Hex`, `isBlank`.
- `src/modules/project-context/service.ts` (modified): `discover()` from the index; `requestReindex`, `requestReindexAfterClone`, `registerIndexJobHandler`, job runner, in-flight registry.
- `src/modules/project-context/repository.ts` (modified): implements `ContextIndexStore`.
- `src/modules/project-context/routes.ts` (modified): `POST /repos/:id/context/reindex`; registers the job handler once.
- `src/adapters/repo-docs/fs.ts` (modified): `readRaw`, `isDirectory`.
- `src/adapters/mocks.ts` (modified): `MockRepoDocsSource.readRaw` / `isDirectory`.
- `src/platform/container.ts` (modified): wire `head`, `jobs`, `log.info` into `ProjectContextService`.
- `src/modules/repos/service.ts` (modified): trigger the re-index after a successful clone job.
- `test/project-context-chunking.test.ts` (new); `test/project-context-index-service.test.ts` (new); `test/project-context-index.it.test.ts` (new); `test/project-context.it.test.ts` (modified); `test/project-context-fs.test.ts` (modified); `test/project-context-service.test.ts` (modified).
- `README.md`, `docs/project-context.md` (modified, docs).

**client/**
- `src/lib/types.ts` (modified): `ContextListing`, `ContextIndexInfo`, `ReindexAccepted`.
- `src/lib/relative-time.ts` (new): compact "just now" / "5m ago" helper, moved from onboarding.
- `src/app/repos/[repoId]/onboarding/_components/OnboardingTourView/helpers.ts` (modified): import the moved helper.
- `src/lib/hooks/project-context.ts` (modified): polling while indexing; `useReindexProjectContext`.
- `src/app/repos/[repoId]/context/_components/ProjectContextView/use-reindex-flow.ts` (new): waiting, completion, 150 s cap, toasts.
- `src/app/repos/[repoId]/context/_components/ProjectContextView/ProjectContextView.tsx` (modified): state tree; the panel is always rendered for a loaded repo.
- `src/app/repos/[repoId]/context/_components/ProjectContextView/helpers.ts` (modified): drop `relativeTime`; add `listBodyState`.
- `src/app/repos/[repoId]/context/_components/ProjectContextView/styles.ts` (modified): header icon row, footer line 2, spinner.
- `.../_components/FileListPanel/FileListPanel.tsx` (modified): header icon row, list slot, footer.
- `.../_components/FileListPanel/_components/ReindexButton/{ReindexButton.tsx,index.ts,ReindexButton.test.tsx}` (new).
- `.../_components/FileListPanel/_components/IndexFooter/{IndexFooter.tsx,index.ts,IndexFooter.test.tsx}` (new).
- `messages/en/context.json` (modified).
- Test fixtures with `scanned_at` (modified):
  - `ProjectContextView.test.tsx`
  - `ContextDocList.test.tsx`
  - `agents/.../ContextTab.test.tsx`
  - `skills/.../ContextTab.test.tsx`
  - `AgentEditor.test.tsx`
  - `SkillDetail.test.tsx`
- `src/lib/relative-time.test.ts` (new).

## 4. Contracts touched

All contracts are module-local. **No vendor copy is involved**: `server/src/modules/project-context/schemas.ts` and the mirror in `client/src/lib/types.ts`.

- `GET /repos/:id/context` → `ContextListing`:
  `{ glob, cloned, truncated, total, stale, index: { status: "none"|"indexing"|"ready"|"failed", indexed_at: string|null, indexed_sha: string|null, files: int, chunks: int, failed_at?: string, failure_reason?: "timeout"|"clone_missing"|"internal_error" }, files: [{ path, type, size, tokens, too_large, used_by }] }`.
  - `scanned_at` is removed.
  - With no clone: `cloned: false`, `files: []`, `truncated: false`, `total: 0`, `stale: false`, and `index` from the stored state (normally `none`).
- `POST /repos/:id/context/reindex` (no body):
  - `202 { status: "accepted", job_id }`;
  - `404` unknown or foreign repository;
  - `409 { error: { code: "not_cloned", message } }`, when the repository has no clone path (Q7, Q8 defaults);
  - `503 { error: { code: "job_unavailable", message } }`;
  - `422` for a malformed id (`IdParams`).
- DB (new tables, snake_case via an explicit column name on every builder):
  - `context_index_state`: one row per repository, PK `repo_id` → `repos.id` ON DELETE CASCADE.
    - `status` text enum `ready|failed` (persisted = last finished outcome; no row means `none`; `indexing` is in memory only, Q1).
    - `indexed_at` timestamptz null; `indexed_sha` text null; `glob` text null.
    - `files` int not null default 0; `chunks` int not null default 0.
    - `truncated` bool not null default false; `total` int not null default 0.
    - `failed_at` timestamptz null; `failure_reason` text enum `timeout|clone_missing|internal_error` null.
    - `updated_at` timestamptz not null default now.
  - `context_files`:
    - `id` uuid PK defaultRandom; `repo_id` FK cascade not null; `path` text not null; `type` text not null.
    - `size` bigint (mode number) not null; `tokens` int not null.
    - `content_hash` text null (null for `too_large` and I/O-unreadable files, Q2).
    - `too_large`, `unreadable`, `empty` bool not null default false.
    - unique `(repo_id, path)`.
  - `context_chunks`:
    - `id` uuid PK defaultRandom; `file_id` FK → `context_files.id` cascade not null; `repo_id` FK → `repos.id` cascade not null.
    - `ordinal` int not null; `breadcrumb` jsonb `string[]` not null default `[]`.
    - `start_offset`, `end_offset` int not null; `tokens` int not null; `text` text not null; `content_hash` text not null.
    - unique `(file_id, ordinal)`; index on `repo_id`.
- Ports (application layer, `ports.ts`): `RepoDocsSource.readRaw(root, relPath, maxBytes): Promise<RawRead>`; `RepoDocsSource.isDirectory(root): Promise<boolean>`; `CloneHead`; `ContextIndexStore`; `IndexJobs`; `ProjectContextLog.info`. Exact shapes are in step 3.

## 5. Skills for implementer

| Skill | Governs | Key rules for this task |
|---|---|---|
| onion-architecture | steps 3, 5, 6, 7, 8, 9, 10, 11, 12 | `service.ts`, `indexer.ts`, `domain/`, `ports.ts` import no `fastify`, `drizzle-orm`, `node:fs`. The service takes narrow ports (`store`, `docs`, `head`, `jobs`, `log`), never the `Container`. The repository returns plain records, never `$inferSelect` rows. The repos module reaches project-context only through `container.projectContext`, never by importing its files. `domain/` is justified: the chunker is real business rules. |
| fastify-best-practices | step 10 | The route only parses `IdParams`, calls one service method and sets 202. Errors are `AppError`s mapped by the global handler. The response schema is declared for 202. The job handler is registered once at plugin load. |
| zod | steps 2, 10 | One schema drives validation and serialization. `z.enum` for status and reason. `.nullable()` for `indexed_at`/`indexed_sha`; `.optional()` only for `failed_at`/`failure_reason`. Keep the compile-time `Assignable` checks against `types.ts`. |
| drizzle-orm-patterns | steps 1, 7 | Explicit snake_case names. FK references via arrow functions. `db.transaction` for the swap. Batch inserts (≤ 1,000 rows per statement). Read the listing inside `db.transaction(fn, { isolationLevel: 'repeatable read' })`. Migrations only via `pnpm db:generate`. |
| postgresql-table-design | step 1 | `timestamptz`, `text`, `bigint` for size, NOT NULL with defaults, FK index on `repo_id` (and `file_id` through the unique key's leftmost column), `ON DELETE CASCADE` for AC-11. |
| security | steps 6, 8, 9, 10 | `:repoId` is workspace-checked before anything is queued (404). The index reads only paths discovery accepts (glob + `validateDocPath` + fail-closed fs). Chunk and heading text are stored as data and never echoed into logs. Log lines carry counts, ms, sha and repository id only. |
| react-frontend-architecture | steps 14 to 21 | Data access only in `src/lib/hooks/project-context.ts`. The flow hook sits next to its single consumer. New sub-components go in `FileListPanel/_components/<Pascal>/` with `index.ts`. The relative-time helper moves to `src/lib/` (second consumer). Strings live in `messages/en/context.json`. |
| react-best-practices | steps 16 to 21 | Derive `pending`, `gaveUp`, footer text and list state during render. `useEffect` only for the 150 s timer and for watching the query result for completion. Clean up timers. Icon-only button has `aria-label`; the live region is `aria-live="polite"`. No `{count && ...}` with numbers. |
| react-testing-library | steps 23, 24 | Test user-visible behaviour (roles, names, text). Use the repo shim `src/test/user.ts` instead of `userEvent` (not installed). `vi.useFakeTimers()` for the 150 s cap. Mount-late harness for toasts (client INSIGHTS). |
| next-best-practices | step 20 | `'use client'` stays on the existing view/panel files only. No page/layout changes. |

## 6. Architecture constraints

- Server layering: `routes.ts` → `service.ts` (+ `indexer.ts`, `domain/chunking.ts`) → `repository.ts`. Don't collapse it. `service.ts`/`indexer.ts`/`domain/` may import `platform/errors.js` and `platform/resilience.js` (`TimeoutError`, as onboarding does), `node:crypto` (in `helpers.ts`), and `@devdigest/reviewer-core` (`estimateTokens`). Nothing else from infra.
- One service instance: the job handler registration, the reindex route, the listing and the clone trigger must all use the single `container.projectContext` singleton, so the in-flight registry is shared (AC-3). Do **not** construct a second `ProjectContextService` the way `repo-intel/routes.ts` does for its own service.
- Cross-module: `repos/service.ts` calls `this.container.projectContext.requestReindexAfterClone(...)`. It must not import any `project-context/*` file.
- Do-not-touch: `*/vendor/shared/**`, `client/src/vendor/ui/**` (do not add props to `IconBtn`; the `ddspin` keyframes in `vendor/ui/styles.css` may be *used* via an inline `animation` style, not edited), `server/src/db/migrations/**` (only `pnpm db:generate` writes there), `*/pnpm-lock.yaml`.
- Tests: the server keeps tests in `server/test/` (existing convention for every project-context suite; `.it.test.ts` = Testcontainers). Client tests sit next to the code with the same base name.
- Naming: server files kebab-case; client component folders PascalCase with lowercase siblings; Drizzle columns camelCase in TS with an explicit snake_case name.
- Specs are read-only.

## 7. Steps

Owners (multi-agent): **impl** = implementer, **tw** = test-writer. Lanes: **S** (server) and **C** (client) run in parallel. Within a lane, steps run in order unless marked "parallel".

### Lane S — server

**Step 1. DB tables + migration** (impl, S)
- Files: `server/src/db/schema/project-context.ts`, `server/src/db/schema.ts`; then run `npx --yes pnpm@10 db:generate` in `server/` (generated files under `src/db/migrations/**` are committed as produced, never edited).
- Change:
  - Add `contextIndexState`, `contextFiles` and `contextChunks` exactly as in section 4. Use `.references(() => repos.id, { onDelete: 'cascade' })`, and the same for `contextFiles.id` from chunks.
  - Use explicit names (`'repo_id'`, `'indexed_at'`, ...).
  - Unique and index definitions as listed. Add the three tables to the `schema` object in `db/schema.ts`.
  - Do not reuse the unused `code_chunks` table.
- Skill: drizzle-orm-patterns, postgresql-table-design.
- **Covers: AC-4, AC-5, AC-6, AC-7, AC-11**

**Step 2. Wire contract (types + Zod)** (impl, S)
- Files: `server/src/modules/project-context/types.ts`, `schemas.ts`, `constants.ts`.
- Change:
  - `types.ts`:
    - Add `IndexStatus = 'none'|'indexing'|'ready'|'failed'` and `FailureReason = 'timeout'|'clone_missing'|'internal_error'`.
    - Add `ContextIndexInfo { status; indexed_at: string|null; indexed_sha: string|null; files; chunks; failed_at?; failure_reason? }`.
    - Change `ContextListing`: remove `scanned_at`; add `stale: boolean` and `index: ContextIndexInfo`.
    - Add `ReindexAccepted { status: 'accepted'; job_id: string }`.
    - Add application records:
      - `ManifestEntry { path; type; size; tokens; contentHash: string|null; tooLarge; unreadable; empty }`;
      - `ChunkRecord { ordinal; breadcrumb: string[]; startOffset; endOffset; tokens; text; contentHash }`;
      - `IndexBuild { indexedSha; glob; truncated; total; files: (ManifestEntry & { chunks: ChunkRecord[] })[] }`;
      - `IndexStateRecord { status: 'ready'|'failed'; indexedAt: Date|null; indexedSha: string|null; glob: string|null; files; chunks; truncated; total; failedAt: Date|null; failureReason: FailureReason|null }`.
  - `schemas.ts`: Zod `ContextIndexInfo`, the updated `ContextListing` and `ReindexAccepted`. Extend the `SchemaMatchesApplicationTypes` tuple with both.
  - `constants.ts`: `MAX_CHUNK_TOKENS = 800`, `INDEX_JOB_KIND = 'project_context_index'`, `FAILURE_REASONS`, `INSERT_BATCH = 1000`.
- Skill: zod, onion-architecture.
- **Covers: AC-1, AC-4, AC-9, AC-13**

**Step 3. Ports** (impl, S)
- File: `server/src/modules/project-context/ports.ts`.
- Change:
  - Add `RawRead = { kind: 'ok'; bytes: Uint8Array } | { kind: 'missing'|'too_large'|'invalid_path'|'unreadable' }`.
  - Extend `RepoDocsSource` with `readRaw(root, relPath, maxBytes): Promise<RawRead>` (same fail-closed rules as `read`, no decoding) and `isDirectory(root): Promise<boolean>`. `read()` keeps its signature and behaviour; the run and Brief paths use it (AC-12).
  - Add `CloneHead { currentHead(owner: string, name: string): Promise<string> }`.
  - Add `IndexJobs { register(kind: string, handler: (payload: unknown) => Promise<void>): void; enqueue(workspaceId: string, kind: string, payload: unknown): Promise<{ id: string; done: Promise<void> }> }` (structurally satisfied by `JobRunner`).
  - Add `ContextIndexStore`:
    - `readListing(repoId): Promise<{ state: IndexStateRecord|undefined; files: ManifestEntry[] }>`: one consistent snapshot.
    - `replaceIndex(repoId, build: IndexBuild, indexedAt: Date, assertNotCancelled: () => void): Promise<void>`: one transaction.
    - `recordFailure(repoId, failedAt: Date, reason: FailureReason): Promise<void>`: keeps counts, sha and `indexed_at`.
  - Extend `ProjectContextLog` with `info(msg: string, data?: Record<string, unknown>): void`.
- Skill: onion-architecture.
- **Covers: AC-4, AC-6, AC-8, AC-9, AC-13**

**Step 4. Fs adapter + mock** (impl, S; parallel with step 5)
- Files: `server/src/adapters/repo-docs/fs.ts`, `server/src/adapters/mocks.ts`.
- Change:
  - Refactor the segment-by-segment `lstat`/realpath walk of `read()` into a private helper. Behaviour stays identical (INSIGHTS: do not simplify to one realpath check).
  - `read()` = helper + strict UTF-8 decode (unchanged). `readRaw()` = helper + size check + raw `Buffer`.
  - `isDirectory(root)` = `stat(root).isDirectory()`; false on any error.
  - `MockRepoDocsSource`:
    - `readRaw` returns UTF-8 bytes for string entries, `too_large` for `{size}` over the cap, and `unreadable` for `'unreadable'`.
    - Add a `Uint8Array` entry type (invalid UTF-8 bytes) so tests can model "binary named .md".
    - `isDirectory` returns `files !== null`.
    - An optional `failOn?: string` path makes `readRaw` throw, to simulate a mid-build failure.
- Skill: onion-architecture, security.
- **Covers: AC-4, AC-6, AC-7, AC-9, AC-13**

**Step 5. Pure chunker** (impl, S; parallel with step 4)
- File: `server/src/modules/project-context/domain/chunking.ts` (new). Pure TypeScript only: no imports except `MAX_CHUNK_TOKENS` passed in as a parameter or a local const.
- Change: `chunkDocument(text: string, maxTokens = 800): ChunkDraft[]` with `ChunkDraft { ordinal, breadcrumb, startOffset, endOffset, tokens, text }`.
  - Offsets are JS string indices (UTF-16 units). `tokens = Math.ceil(len/4)`, the same rule as `estimateTokens` (Q3).
  - Scan line by line, keeping line terminators (`\n`, `\r\n`) inside the line so offsets cover the text exactly.
  - Fences: a line matching `^ {0,3}(`{3,}|~{3,})` opens a fence. It closes on a line of the same char with length ≥ the opener, indented ≤ 3 spaces, and no info string. An unclosed fence runs to the end of the document.
  - Outside a fence, an ATX heading of level 1 to 3 (`^ {0,3}(#{1,3})(?:[ \t]+|$)`, not `####`) starts a new section. Its breadcrumb text is the heading content with the optional closing `#` sequence stripped and trimmed. The breadcrumb is the chain of enclosing level 1 to 3 texts: a level-n heading replaces levels ≥ n.
  - Setext headings and `####`+ never start a section.
  - Non-empty text before the first heading is a preamble section with breadcrumb `[]`. An empty or whitespace-only preamble yields no chunk; its characters are prepended to the first section, so concatenation stays exact.
  - Sections over `maxTokens`:
    - Split into blocks at blank-line boundaries (a run of whitespace-only lines ends a block and stays with the block before it).
    - Pack consecutive blocks greedily while the total is ≤ `maxTokens` (Q3 default).
    - Hard-split any still-oversize piece into slices of at most `maxTokens*4` code units, never cutting between a high and a low surrogate (move the cut back one unit).
  - Every piece of a section keeps the section's breadcrumb. Ordinals are 0-based over the whole document.
  - Invariants: `chunks.map(c => c.text).join('') === text`; no chunk has `tokens > maxTokens`; the output is deterministic.
- Skill: onion-architecture.
- **Covers: AC-5, AC-6**

**Step 6. Indexer (build one index in memory)** (impl, S)
- Files: `server/src/modules/project-context/indexer.ts` (new), `helpers.ts` (add `sha256Hex(data: Uint8Array|string)` via `node:crypto` `createHash('sha256')...digest('hex')`, and `isBlank(s)`).
- Change: `buildIndex(deps: { docs: RepoDocsSource; glob: ResolvedGlob }, input: { clonePath; indexedSha }, isCancelled: () => boolean): Promise<IndexBuild | null>`. It returns null when `walk` returns null, so the caller fails with `clone_missing`.
  1. `docs.walk(clonePath, EXCLUDED, p => glob.regex.test(p) && validateDocPath(p).ok)` uses the same accept rule as today's discovery. Then `capAndSort` (2,000 cap, `truncated`, `total`).
  2. For each kept file (bounded concurrency `READ_CONCURRENCY` via the existing `mapPool`, moved into `helpers.ts`; order is preserved), throw a `CancelledError` (local class) if `isCancelled()`:
     - size > `MAX_DOC_BYTES` → `tooLarge`, `contentHash: null`, `tokens = ceil(size/4)`, no chunks;
     - `readRaw` not ok → `unreadable`, `contentHash: null`, `tokens = ceil(size/4)`, no chunks;
     - bytes read:
       - `contentHash = sha256Hex(bytes)`;
       - decode with `new TextDecoder('utf-8', { fatal: true })` (same decoder as `read()`, so a BOM is stripped exactly as on the run path; recommendation 4/G4);
       - decode error → `unreadable` (hash kept) and `tokens = ceil(size/4)`;
       - `isBlank(text)` → `empty`, `tokens = estimateTokens(text)`, no chunks;
       - otherwise `tokens = estimateTokens(text)`, and `chunks = chunkDocument(text)` mapped to `ChunkRecord` with `contentHash = sha256Hex(chunk.text)` (UTF-8 of the exact text).
  3. `type = docTypeOf(path)`. Return `{ indexedSha, glob: glob.glob, truncated, total, files }`.
- No LLM, no network, no file outside the walk result.
- Skill: onion-architecture, security.
- **Covers: AC-4, AC-5, AC-6, AC-7**

**Step 7. Repository: index store** (impl, S)
- File: `server/src/modules/project-context/repository.ts`.
- Change: implement `ContextIndexStore`.
  - `readListing`: inside `this.db.transaction(async tx => ..., { isolationLevel: 'repeatable read', accessMode: 'read only' })`, select the state row and the `context_files` rows for the repository, ordered by `path`. Map them to `IndexStateRecord` / `ManifestEntry`; no raw rows leave the method. This makes AC-8 hold across the two statements (G2).
  - `replaceIndex`: one `db.transaction`:
    - delete `context_files` where `repo_id` (chunks cascade);
    - insert manifest rows in batches of `INSERT_BATCH` with `.returning({ id, path })`;
    - insert chunk rows in batches of `INSERT_BATCH`;
    - upsert `context_index_state` (`onConflictDoUpdate` on `repo_id`) with `status 'ready'`, `indexedAt`, `indexedSha`, `glob`, `files = build.files.length`, `chunks = Σ chunks`, `truncated`, `total`, `failedAt null`, `failureReason null`, `updatedAt now`;
    - call `assertNotCancelled()` as the last statement before the callback returns, so a cancelled (timed-out) build rolls back.
  - `recordFailure`:
    - upsert the state row setting only `status 'failed'`, `failedAt`, `failureReason` and `updatedAt`;
    - on insert (no previous index), `indexedAt`/`indexedSha`/`glob` are null and the counts are 0;
    - leaves manifest and chunks untouched.
  - Both write methods let FK violations surface (the caller swallows them when the repository was deleted, G13).
- Skill: drizzle-orm-patterns, onion-architecture.
- **Covers: AC-8, AC-9, AC-11**

**Step 8. Service: re-index lifecycle** (impl, S)
- File: `server/src/modules/project-context/service.ts`.
- Change:
  - Extend `ProjectContextDeps` with `head: CloneHead`, `jobs: IndexJobs`, `index: ContextIndexStore` (the same repository instance as `store` may implement both), `now?: () => Date`.
  - Add a private `inflight = new Map<string, { jobId: Promise<string>; cancelled: boolean }>()`.
  - `registerIndexJobHandler()`: `jobs.register(INDEX_JOB_KIND, p => this.runIndexJob(p as { workspaceId; repoId }))`.
  - `requestReindex(workspaceId, repoId): Promise<ReindexAccepted>`:
    1. `store.getRepo` → `NotFoundError` (404) for unknown or foreign.
    2. No `clonePath` → `new AppError('not_cloned', 'The repository has not been cloned', 409)`.
    3. If `inflight.has(repoId)`, return `{ status: 'accepted', job_id: await entry.jobId }` (AC-3; no log).
    4. Otherwise, **synchronously** (before any `await`) set the entry, whose `jobId` is the promise of `jobs.enqueue(workspaceId, INDEX_JOB_KIND, { workspaceId, repoId })` mapped to `.id`.
       - On enqueue rejection: delete the entry and throw `new AppError('job_unavailable', 'The re-index job could not be queued', 503)`. Nothing is written (AC-2).
       - On success: attach `done.then(onSettled, onSettled)`. In `onSettled(err)`:
         - if `err instanceof TimeoutError`, set `entry.cancelled = true`, `recordFailure(repoId, now, 'timeout')` (errors swallowed), and log `project context index failed: timeout` with `{ repoId }`;
         - finally, if `inflight.get(repoId) === entry`, delete it.
       - `done` rejections are always handled (no unhandled rejection).
  - `requestReindexAfterClone(workspaceId, repoId): Promise<void>`: calls `requestReindex` and swallows every error (AC-10). If the repository is not cloned, there is nothing to do.
  - Private `runIndexJob({ workspaceId, repoId })`:
    - `entry = inflight.get(repoId)` (may be undefined in direct unit calls → treat as never cancelled); `t0 = Date.now()`.
    - `repo = store.getRepo(...)`; missing (deleted) → return.
    - No `clonePath` → fail `clone_missing`.
    - `sha = await head.currentHead(owner, name)`; catch → fail `clone_missing`.
    - `build = await buildIndex(..., () => entry?.cancelled === true)`; null → fail `clone_missing`.
    - `CancelledError` → return silently: the timeout was already recorded.
    - `replaceIndex(repoId, build, now(), () => { if (entry?.cancelled) throw new CancelledError() })`.
    - Success: `log.info('project context index: <files> files, <chunks> chunks, <ms> ms, sha <sha>')`.
    - Any other error → fail `internal_error`.
    - "fail(reason)":
      - `await index.recordFailure(repoId, now(), reason)` inside try/catch (swallow, e.g. FK after repository deletion);
      - `log.warn('project context index failed: <reason>', { repoId })`;
      - then throw `new Error('project context index failed: ' + reason)`. A plain Error has no status/code, so `JobRunner`'s `withRetry` does **not** retry it (recommendation 7) and the `jobs` row ends `failed`.
  - Constructor: unchanged AC-3 glob warning.
- Skill: onion-architecture, security.
- **Covers: AC-1, AC-2, AC-3, AC-9, AC-10, AC-11**

**Step 9. Service: listing from the index** (impl, S)
- File: `server/src/modules/project-context/service.ts` (`discover`).
- Change:
  - Repository missing → 404 (unchanged).
  - Compute `index` from `state` + `inflight`:
    - status = `'indexing'` if `inflight.has(repoId)`, else `state?.status ?? 'none'`;
    - `indexed_at` = ISO string or null; `indexed_sha` = string or null;
    - `files`/`chunks` from the state (0 when none);
    - `failed_at`/`failure_reason` only when `state.failedAt` is set.
  - No `clonePath` → `{ glob, cloned: false, truncated: false, total: 0, stale: false, index, files: [] }`.
  - Otherwise `{ state, files } = await index.readListing(repoId)`.
    - `stale = false` when there is no complete index (`state?.indexedAt == null`).
    - Else `stale = !(await docs.isDirectory(clonePath)) || headUnreadableOrDifferent || state.glob !== glob.glob`. `headUnreadableOrDifferent` = `head.currentHead` throws, or returns something other than `state.indexedSha`.
  - `used_by` from `store.usedByRows(...).then(countUsedBy)` as today, run in parallel with the head read.
  - Return:
    - `glob: glob.glob` (current configured glob); `cloned: true`;
    - `truncated`/`total` from the state (false/0 when none);
    - `stale`; `index`;
    - `files` = manifest mapped to `{ path, type, size, tokens, too_large: tooLarge, used_by }`.
  - `discover` must not call `docs.walk`, `docs.read` or `docs.readRaw`.
  - `readFile`, `resolveForRun`, `resolveForBrief` and the attachment methods are **not modified**.
- Skill: onion-architecture, security.
- **Covers: AC-4, AC-8, AC-12, AC-13**

**Step 10. Route** (impl, S)
- File: `server/src/modules/project-context/routes.ts`.
- Change:
  - At plugin load, call `container.projectContext.registerIndexJobHandler()` once.
  - Add `app.post('/repos/:id/context/reindex', { schema: { params: IdParams, response: { 202: ReindexAccepted } } }, async (req, reply) => { const { workspaceId } = await getContext(container, req); const out = await container.projectContext.requestReindex(workspaceId, req.params.id); reply.code(202); return out; })`.
  - Update the header comment block (endpoint list).
  - `GET /repos/:id/context` keeps its handler; its response schema is the new `ContextListing`.
- Skill: fastify-best-practices, zod.
- **Covers: AC-1, AC-2, AC-3, AC-13**

**Step 11. Container wiring** (impl, S)
- File: `server/src/platform/container.ts` (`get projectContext`).
- Change: build one `ProjectContextRepository` and pass it as both `store` and `index`.
  - `head: { currentHead: (owner, name) => this.git.currentHead({ owner, name }) }` (the onboarding precedent; the test override `git` applies).
  - `jobs: this.jobs`.
  - `log: { warn: (m, d) => console.warn(m, d ?? ''), info: (m, d) => console.info(m, d ?? '') }`. Match the existing console style; keep the single-arg call when `d` is absent.
  - The getter stays a lazy singleton.
- Skill: onion-architecture.
- **Covers: AC-1, AC-3, AC-10**

**Step 12. Automatic re-index after a successful clone job** (impl, S)
- File: `server/src/modules/repos/service.ts` (`runCloneJob`).
- Change:
  - After `updateClonePath` and the existing repo-intel enqueue block, inside the existing `if (workspaceId)`: `await this.container.projectContext.requestReindexAfterClone(workspaceId, repoId)`. That method never throws; still wrap it in `try {} catch {}` with a comment ("index follow-up never fails the clone", AC-10).
  - This covers the initial clone and the fetch from `POST /repos/:id/refresh` (both run `CLONE_JOB_KIND`).
  - `refresh()` and `add()` are unchanged. No change to repo-intel.
- Skill: onion-architecture.
- **Covers: AC-10**

**Step 13. Docs** (impl, S)
- Files: `server/README.md` (Project Context endpoints table: add `POST /repos/:id/context/reindex`, reword the `GET /repos/:id/context` row to "served from the persisted index; `index` + `stale`"), `server/docs/project-context.md` (short section: tables, job lifecycle, in-memory `indexing`, stale rule).
- **Covers: none (documentation of the new endpoint and lifecycle; no behaviour)**

### Lane C — client (parallel with lane S; the wire contract is fixed in section 4)

**Step 14. Client wire types** (impl, C)
- File: `client/src/lib/types.ts`.
- Change:
  - Add `ContextIndexStatus`, `ContextFailureReason` and `ContextIndexInfo` (same fields as section 4).
  - `ContextListing`: remove `scanned_at`; add `stale: boolean` and `index: ContextIndexInfo`.
  - Add `ReindexAccepted { status: "accepted"; job_id: string }`.
  - Keep the "mirrors server schemas.ts" comment.
- Skill: react-frontend-architecture.
- **Covers: AC-13, AC-14**

**Step 15. Shared compact relative time** (impl, C; parallel with step 14)
- Files:
  - `client/src/lib/relative-time.ts` (new): move the compact helper from `OnboardingTourView/helpers.ts` ("just now" under 60 s, `Nm ago`, `Nh ago`, `Nd ago`; raw string on an unparsable date). Name it `compactRelativeTime(iso, now = Date.now())`.
  - `OnboardingTourView/helpers.ts`: import and re-export it under its old name, so onboarding callers and tests are untouched.
  - `ProjectContextView/helpers.ts`: delete `relativeTime` (its only user is `FileListPanel`).
- Skill: react-frontend-architecture.
- **Covers: AC-14**

**Step 16. Data hooks** (impl, C)
- File: `client/src/lib/hooks/project-context.ts`.
- Change:
  - `useProjectContext`: add `refetchInterval: (query) => query.state.data?.index.status === "indexing" ? REINDEX_POLL_MS : false` with `REINDEX_POLL_MS = 2000` (within the 3 s UI NFR; recommendation 5). This covers jobs started by any trigger while the page is open. The Context tabs share this query and poll too, which is harmless.
  - Add `useReindexProjectContext(repoId)`: `useMutation` → `api.post<ReindexAccepted>(\`/repos/${repoId}/context/reindex\`)`. `onSettled` invalidates `queryKeys.context(repoId)` (taken from the mutation variables, not the closure; same pattern as `useSetContextPaths`). Errors (409/503/network/5xx) go to the global `MutationCache` toast (AC-17 "rejected or fails to reach"); no `silentError`.
  - Export `REINDEX_POLL_MS` and `REINDEX_WAIT_MAX_MS = 150_000` from this module.
- Skill: react-frontend-architecture, react-best-practices.
- **Covers: AC-15, AC-16, AC-17**

**Step 17. Re-index flow hook** (impl, C)
- File: `client/src/app/repos/[repoId]/context/_components/ProjectContextView/use-reindex-flow.ts` (new; one consumer, colocated).
- Change: `useReindexFlow(repoId, listing)` returns `{ start, running, gaveUp }`.
  - State: `wait: { repoId; since: { indexedAt: string|null; failedAt: string|null }; sawIndexing: boolean } | null` and `gaveUp: boolean`.
  - `start()`: set `wait` with the baseline from the current `listing.index` and `gaveUp=false`; call `mutate(..., { onError: () => setWait(null) })`.
  - Derived during render:
    - `serverIndexing = listing?.index.status === "indexing"`;
    - `finished = wait && listing && !serverIndexing && (listing.index.indexed_at !== wait.since.indexedAt || listing.index.failed_at !== wait.since.failedAt || wait.sawIndexing)`. This baseline comparison catches a job that ended before the first poll (client INSIGHTS 2026-10-02; recommendation 6).
  - Effect A (watching the query result):
    - mark `sawIndexing` when `serverIndexing` while waiting;
    - when `finished`: if `listing.index.status === "failed"` (or `failed_at` advanced) call `notify.error(t("reindex.failed"))`; on ready, no toast;
    - then `setWait(null)`.
  - Effect B (timer): while `wait` is set, `setTimeout(REINDEX_WAIT_MAX_MS)` → `notify.error(t("reindex.timeout"))`, `setWait(null)`, `setGaveUp(true)`. Clean up on unmount or change.
  - `gaveUp` resets when `serverIndexing` becomes false or when `start()` runs.
  - Ignore `wait` whose `repoId !== repoId`, so switching repositories shows the new repository's own state.
  - `running = (serverIndexing && !gaveUp) || (wait !== null && mutation pending)`.
- Skill: react-best-practices, react-frontend-architecture.
- **Covers: AC-15, AC-16, AC-17**

**Step 18. Messages** (impl, C; parallel with steps 14 to 17)
- File: `client/messages/en/context.json` (`page` namespace).
- Change:
  - Remove `refresh` and `lastScanned`. Replace `indexed` with `"Indexed: {files, plural, one {# file} other {# files}} · {chunks, plural, one {# chunk} other {# chunks}}"`; ICU `#` gives the thousands separator, e.g. "1,240".
  - Add:
    - `"last": "last {when}"`
    - `"outOfDate": " · out of date"`
    - `"notIndexed": "Not indexed yet"`
    - `"notIndexedBody": "Build the index to list this repository's documents."`
    - `"reindex": "Re-index"`
    - `"reindexing": "Re-indexing…"`
    - `"cloneFirst": "Clone the repository first"`
  - Add a `reindex` namespace (or keys under `page`):
    - `"failed": "Re-index failed. The previous index is kept."`
    - `"timeout": "Re-index is taking too long. The previous index is kept."`
  - Keep every other key.
- Skill: react-frontend-architecture.
- **Covers: AC-14, AC-16, AC-17, AC-18, AC-19**

**Step 19. ReindexButton and IndexFooter components** (impl, C)
- Files (new):
  - `.../FileListPanel/_components/ReindexButton/{ReindexButton.tsx,index.ts}`
  - `.../FileListPanel/_components/IndexFooter/{IndexFooter.tsx,index.ts}`
  - Shared styles in `ProjectContextView/styles.ts` (or a sibling `styles.ts` in each folder).
- Change:
  - `ReindexButton({ running, noClone, onClick })`:
    - a native `<button type="button">` that copies `IconBtn`'s 30 px box, radius, colours and hover;
    - `Icon.RefreshCw` (the refresh icon of screenshot 41);
    - `aria-label` = `t("page.reindex")`, or `t("page.reindexing")` while running;
    - `disabled={running || noClone}`;
    - while running, the icon gets `animation: "ddspin 1s linear infinite"`;
    - when `noClone`: `title={t("page.cloneFirst")}` plus `aria-describedby` pointing to a visually hidden span with the same text (recommendation 8: real `disabled` + `title` + `aria-describedby`);
    - otherwise `title` = its label.
    - Do not modify vendored `IconBtn`.
  - `IndexFooter({ index, stale, running })`, muted text per screenshot 42:
    - **index exists** (`index.indexed_at !== null`):
      - line 1: green dot + `t("page.indexed", { files: index.files, chunks: index.chunks })`;
      - line 2: an element with `role="status"` / `aria-live="polite"` holding either `t("page.reindexing")` (running) or `t("page.last", { when: compactRelativeTime(index.indexed_at) }) + (stale ? t("page.outOfDate") : "")`.
    - **no complete index** (status `none`, or `failed`/`indexing` without `indexed_at`, Q4 defaults): a single line in the same polite live region: `t("page.reindexing")` while running, else `t("page.notIndexed")`. No dot.
  - The live region element is always rendered, so text changes are announced.
- Skill: react-best-practices, react-frontend-architecture.
- **Covers: AC-14, AC-16, AC-18, AC-19**

**Step 20. FileListPanel restructure** (impl, C)
- Files: `.../FileListPanel/FileListPanel.tsx`, `ProjectContextView/styles.ts`.
- Change:
  - New props: `{ listing: ContextListing; repoName; selected; onSelect; reindex: { running; onClick }; children?: React.ReactNode }`. `children` is the list-area override for the empty states.
  - Header per screenshot 41: the caps "PROJECT CONTEXT" title, then the mono subtitle = repository name (unchanged, old AC-7), then a **separate icon row below the subtitle, left-aligned**, containing only `<ReindexButton running noClone={!listing.cloned} onClick />` (AC-19; no plus, folder, upload or download icons). The row container is `role="toolbar"` with `aria-label={t("page.panelTitle")}`, which gives tests and screen readers a scope.
  - List area: `children` when provided; else the truncated notice + rows (unchanged row markup).
  - Footer: `<IndexFooter index stale running />` only when `listing.cloned`; no footer for an uncloned repository (Q5).
  - Remove `onRefresh` and the `relativeTime` import.
- Skill: react-frontend-architecture, react-best-practices.
- **Covers: AC-14, AC-15, AC-16, AC-18, AC-19**

**Step 21. ProjectContextView state tree** (impl, C)
- Files: `ProjectContextView/ProjectContextView.tsx`, `ProjectContextView/helpers.ts`.
- Change:
  - Keep, in order: no repositories → "Select a repository"; `repoNotFound` → `RepoNotFound`; `isLoading` (no data) → skeleton.
  - Error: `ErrorState` with Retry **only when `!listing`** (G8). A failed background refetch keeps the current list and footer (AC-17).
  - Otherwise always render `<div style={s.layout}><FileListPanel ...>{listBody}</FileListPanel>{preview}</div>`, with `const flow = useReindexFlow(repoId, listing)`.
  - Add the pure helper `listBodyState(listing): "notCloned" | "notIndexed" | "empty" | "files"` in `helpers.ts`:
    - `!cloned` → `notCloned` (takes precedence over every index state);
    - `files.length === 0 && index.indexed_at === null` → `notIndexed`;
    - `files.length === 0` → `empty`;
    - else `files`.
  - `listBody`:
    - `notCloned` → `EmptyState` with the existing `notClonedTitle`/`notClonedBody`;
    - `notIndexed` → `EmptyState` with title `t("page.notIndexed")`, body `t("page.notIndexedBody")` and a Re-index action. Use a vendored `Button` labelled `t("page.reindex")`, disabled while `flow.running`, calling `flow.start` (AC-14 "offers the Re-index action");
    - `empty` → `EmptyState` naming the glob (existing keys);
    - `files` → `undefined` (panel renders rows).
  - The preview panel renders only for `files`.
  - During indexing the previous rows stay, because the listing keeps the last complete manifest (AC-16).
- Skill: react-best-practices, next-best-practices (no new `'use client'` boundaries).
- **Covers: AC-14, AC-15, AC-16, AC-17, AC-18**

**Step 22. Update `scanned_at` fixtures elsewhere** (tw, C)
- Files:
  - `client/src/components/context-doc-list/ContextDocList.test.tsx`
  - `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.test.tsx`
  - `client/src/app/skills/_components/ContextTab/ContextTab.test.tsx`
  - `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx`
  - `client/src/app/skills/_components/SkillDetail/SkillDetail.test.tsx`
- Change: replace `scanned_at` with `stale: false, index: { status: "ready", indexed_at: "...", indexed_sha: "abc", files: N, chunks: M }`. No behaviour change in those components.
- **Covers: none (contract migration of existing test fixtures; keeps the suites compiling and green)**

### Tests

**Step 23. Client tests** (tw, C)
- Files (new/modified):
  - `client/src/lib/relative-time.test.ts`: "just now", "5m ago", unparsable.
  - `IndexFooter/IndexFooter.test.tsx`:
    - ready with `files: 12, chunks: 1240` renders exactly "Indexed: 12 files · 1,240 chunks" and "last 5m ago" as two separate lines;
    - `stale: true` appends " · out of date";
    - `status: "none"` renders the single line "Not indexed yet";
    - `running` replaces only line 2 with "Re-indexing…" inside the `role="status"` element, and line 1 keeps the counts.
  - `ReindexButton/ReindexButton.test.tsx`:
    - idle: enabled, named "Re-index";
    - running: disabled, named "Re-indexing…";
    - `noClone`: disabled, `toHaveAccessibleDescription("Clone the repository first")`, `title` set.
  - `ProjectContextView/ProjectContextView.test.tsx` (rewrite fixtures; mock `api` at the hook boundary as today):
    - (a) the header toolbar contains exactly one button, named "Re-index"; no "New file", "New folder", "Upload" or "Download".
    - (b) never indexed: list area shows "Not indexed yet" with a Re-index action; footer single line.
    - (c) click Re-index → POST → status `indexing` (rows and line 1 still shown, button disabled) → `ready` with a new file and counts. The new row appears, footer counts and time update, no navigation and no toast.
    - (d) AC-17 error cases, each showing a toast, keeping the footer text and leaving the button enabled: 409 response, 503 response, network error, a `failed` status, and status still `indexing` after 150 s (`vi.useFakeTimers()`). Use the mount-late toast harness from client INSIGHTS.
    - (e) uncloned repository → disabled button with the hint and the not-cloned empty state.
    - (f) a refetch error with data present keeps rows (no ErrorState).
  - Use `src/test/user.ts`, not `userEvent`.
- Skill: react-testing-library.
- **Covers: AC-14, AC-15, AC-16, AC-17, AC-18, AC-19**

**Step 24. Server unit tests** (tw, S)
- Files (`server/test/`):
  - `project-context-chunking.test.ts` (new):
    - the AC-5 fixture: preamble, `#`/`##`/`###`/`####`, a `## x` inside a fenced block, an unclosed fence, a setext heading, and a 3,500-token section without blank lines;
    - assert the exact chunk list: breadcrumbs, offsets, no chunk over 800 tokens, fenced heading and `####` not split, concatenation equals the input;
    - a no-heading document gives one preamble chunk;
    - a surrogate pair at the cut point is not split;
    - CRLF input keeps exact offsets;
    - chunking twice gives deep-equal output.
  - `project-context-index-service.test.ts` (new), with in-memory fake ports (`store`, `index`, `docs` = `MockRepoDocsSource`, `head`, `jobs` fake with controllable `done`, `log` spy):
    - AC-1: requestReindex → `{status:'accepted', job_id}` and `discover` reports `indexing` until `done` settles.
    - AC-3: two calls share one `job_id`; `enqueue` called once.
    - AC-2: 404 foreign, 409 `not_cloned`, 503 when `enqueue` rejects; the store is untouched.
    - AC-9: `done` rejects with `TimeoutError` → `recordFailure('timeout')`, the cancelled build never reaches `replaceIndex` / its `assertNotCancelled` throws. A head failure gives `clone_missing`; a store error gives `internal_error`.
    - AC-13: `discover` never calls `walk`/`read`/`readRaw`; stale when head differs, head throws, `isDirectory` is false or the glob differs; not stale for `none`.
    - Log lines: success format, failure format, nothing extra on a merged request.
    - AC-7 and AC-6 at build level, via `buildIndex` with mock docs.
  - `project-context-fs.test.ts` (modified): `readRaw` follows the same symlink/outside-clone refusals as `read`; `isDirectory`.
  - `project-context-service.test.ts` (modified): fixtures/ctor deps for the new listing shape.
- Note: `pnpm typecheck` does not cover `server/test/**` (server INSIGHTS); type errors only show at runtime.
- Skill: onion-architecture (fakes, no DB).
- **Covers: AC-1, AC-2, AC-3, AC-5, AC-6, AC-7, AC-9, AC-13**

**Step 25. Server integration tests** (tw, S)
- Files: `server/test/project-context-index.it.test.ts` (new) and `server/test/project-context.it.test.ts` (modified: old AC-1/2/4/9/36 tests now POST reindex and await `container.jobs.onIdle()` before GET; the old `scanned_at` assertions are removed).
- New cases (Testcontainers pg, tmp-dir clone, `MockGitClient` with a controllable `head`):
  - AC-1: POST → 202 + `job_id`; an immediate GET shows `indexing`; after idle, `ready` with a later `indexed_at`.
  - AC-2:
    - a foreign repository gives 404;
    - an uncloned repository gives 409 `not_cloned`;
    - a jobs override whose `enqueue` rejects gives 503 (e.g. spy on `container.jobs.enqueue`);
    - the state row is identical before and after each.
  - AC-3: two POSTs return the same `job_id`; exactly one `jobs` row of kind `project_context_index` for the repository.
  - AC-4: the old AC-1 fixture yields manifest paths exactly a, b, c; a 2,001-file fixture gives 2,000 entries, `truncated: true`, `total: 2001`; `indexed_sha` equals the mock head.
  - AC-6: two re-indexes of an unchanged clone give identical `(path, ordinal, content_hash)` sets; editing one section changes only that section's chunk hashes.
  - AC-7: one too-large, one invalid-UTF-8, one whitespace-only and one normal file → `files: 4`, chunks only for the normal file, three flags set.
  - AC-8: a second build of a different fixture while GET is polled in a loop; every response has `files.length === index.files` and a path set equal to build A or build B.
  - AC-9: a `repoDocs` override with `failOn` on the second build → previous `files`, `chunks`, `indexed_at`, `indexed_sha` and chunk rows intact; `status: "failed"`, `failure_reason: "internal_error"`.
  - AC-10:
    - `POST /repos` with `MockGitClient` clone (clone path → tmp clone) and the jobs drained → the listing reaches `ready` with no POST;
    - with a failing index, the clone path is still recorded and `POST /repos/:id/refresh` still answers `{ status: "refreshing" }`.
  - AC-11: delete repo A → no `context_index_state`/`context_files`/`context_chunks` rows for A; repo B intact.
  - AC-12: with no index, and again with a stale index whose manifest lacks the attached path, a run includes the attached document read from disk; `specs_read`/`project_context_docs` equal the pre-feature expectations. Reuse the existing AC-24/31 helpers; mind the known `waitForPrRuns` race in server INSIGHTS.
  - AC-13: after re-index GET returns the manifest; after the mock head changes, `stale: true` with old entries; with the clone directory removed (path still recorded), `stale: true`; a never-indexed repository gives `files: []`, `status: "none"`.
- Skill: drizzle-orm-patterns (assertions via `t.*` tables), fastify-best-practices (`inject`).
- **Covers: AC-1, AC-2, AC-3, AC-4, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13**

## 8. Acceptance checks

### AC coverage table

| AC | Steps | Proof |
|---|---|---|
| AC-1 | 2, 8, 10, 11, 16, 24, 25 | `server`: `npx --yes pnpm@10 exec vitest run project-context-index` (unit + it AC-1 cases) |
| AC-2 | 8, 10, 24, 25 | it: 404 / 409 `not_cloned` / 503 with unchanged state; unit: 503 path |
| AC-3 | 8, 10, 11, 24, 25 | it: same `job_id` twice, one `jobs` row; unit: one `enqueue` |
| AC-4 | 1, 2, 3, 4, 6, 9, 25 | it: a/b/c manifest, 2,001 → 2,000 + `truncated`, `indexed_sha` = head |
| AC-5 | 1, 5, 6, 24 | unit `project-context-chunking.test.ts` fixture |
| AC-6 | 1, 3, 4, 5, 6, 24, 25 | unit determinism; it identical `(path, ordinal, content_hash)` + one-section edit |
| AC-7 | 1, 4, 6, 24, 25 | it four-file fixture: `files: 4`, three flags, chunks only for the normal file |
| AC-8 | 3, 7, 9, 25 | it concurrent GET loop during a build never mixes two builds |
| AC-9 | 2, 3, 4, 7, 8, 24, 25 | unit timeout + cancel + reasons; it mid-build failure keeps the previous index |
| AC-10 | 8, 11, 12, 25 | it: clone job → `ready` with no POST; failing index does not change clone/refresh |
| AC-11 | 1, 7, 8, 25 | it: delete repo A → no index rows; repo B intact |
| AC-12 | 9 (no change to run paths), 25 | it: run with no index and with a stale index reads the attached doc from disk; existing AC-24..29 suites green |
| AC-13 | 2, 3, 4, 9, 10, 14, 24, 25 | it: manifest, stale on head change, stale on missing clone dir, `none` + `[]`; unit: no walk/read on GET |
| AC-14 | 14, 15, 18, 19, 20, 21, 23 | client unit `IndexFooter`, `ProjectContextView` (b); manual browser check M1 |
| AC-15 | 16, 17, 20, 21, 23 | client unit `ProjectContextView` (c); manual browser check M2 |
| AC-16 | 16, 17, 18, 19, 20, 21, 23 | client unit `IndexFooter` running, `ReindexButton` running, `ProjectContextView` (c) |
| AC-17 | 16, 17, 18, 21, 23 | client unit `ProjectContextView` (d) five cases, (f) |
| AC-18 | 18, 19, 20, 21, 23 | client unit `ReindexButton` noClone, `ProjectContextView` (e) |
| AC-19 | 18, 19, 20, 23 | client unit `ProjectContextView` (a); manual browser check M3 (replaces the spec's e2e, Q9) |

All 19 ACs are covered. None is uncovered. The spec's e2e checks for AC-14, AC-15 and AC-19 are replaced by unit tests plus manual browser checks M1 to M3 (Q9, user-approved).

### Commands

`server/` (Docker Desktop running for Testcontainers and the dev DB):
1. `npx --yes pnpm@10 db:generate` (once, after step 1). Inspect the generated SQL: three `CREATE TABLE`, FKs with `ON DELETE CASCADE`, the unique/index statements. Do not edit it.
2. `npx --yes pnpm@10 db:migrate` (dev DB).
3. `npx --yes pnpm@10 typecheck`
4. `npx --yes pnpm@10 test` (unit + integration). Re-run once if only the known `run-executor` trace race flakes (server INSIGHTS 2026-10-12).

`client/`:
1. `npx --yes pnpm@10 typecheck`
2. `npx --yes pnpm@10 test` (targeted: `npx --yes pnpm@10 exec vitest run IndexFooter ReindexButton ProjectContextView relative-time ContextDocList ContextTab AgentEditor SkillDetail`, filtering by base name, not by bracketed path)
3. `npx --yes pnpm@10 lint`

### Manual browser checks

API on :3001 and web on :3000. Land on `/` first, then open the repository and click "Project Context" (client INSIGHTS: no deep-link).

- **M1 (AC-14)**:
  - a freshly indexed repository shows two muted lines: a green dot + "Indexed: N files · M chunks" (thousands separators), then "last just now";
  - after a new commit is fetched with no re-index, line 2 reads "last … · out of date";
  - a repository cloned before this feature shows "Not indexed yet" in the footer and the list area, with a Re-index action;
  - compare against screenshot 42.
- **M2 (AC-15, AC-16)**:
  - add a markdown file under `specs/` in the clone, then click the header Re-index;
  - the icon spins, the button is disabled and named "Re-indexing…", line 2 reads "Re-indexing…" and the rows stay;
  - then the new file appears and the counts and time update, with no navigation and no toast.
- **M3 (AC-19, design)**:
  - the header shows "PROJECT CONTEXT", the repository name, and below it one icon row containing only the refresh icon (screenshot 41 minus New file / New folder / Upload, by decision);
  - no Download button anywhere.
- **M4 (AC-17, AC-18)**:
  - an uncloned repository shows the disabled button with the "Clone the repository first" tooltip;
  - with the API stopped, clicking Re-index shows an error toast and the footer is unchanged.

## 9. Risks & open questions

- **Timeout window.** A build that times out exactly while its swap transaction is committing could still commit (`assertNotCancelled` runs just before commit). The window is milliseconds and the result is a complete, consistent index followed by `status: failed (timeout)`. The architecture-reviewer should confirm this is acceptable.
- **Single process.** `indexing` and the merging of duplicate requests (AC-3) live in process memory (Q1, recommendation 1). They are lost on restart, which is intended: no stuck state. They would not be shared across multiple server processes.
- **Swap cost.** The swap deletes and re-inserts the whole manifest and chunks in one transaction (recommendation 2). On ~20 MB of chunk text this holds row locks for the duration. Readers are unaffected under MVCC. Watch the 30 s re-index NFR.
- **Read lock-in.** The listing reads under `repeatable read`. The architecture-reviewer should check that no other read path is added later without it.
- **Second-tab staleness.** A second tab that loaded before a job started does not see `indexing` until it refetches (global `refetchOnWindowFocus: false`; G10 accepted). It does see the result on its next load.
- **Two Re-index controls.** The "Not indexed yet" state renders two (header icon + empty-state action). Tests must scope header queries to the toolbar (AC-19 is about the header row).
- **BOM.** The decoder strips a leading BOM (G4), so chunk offsets and hashes are over the BOM-less text, while the file `content_hash` is over raw bytes.
- **Security review focus.** The index reads only walk-accepted, `validateDocPath`-passing paths via the fail-closed adapter. `readRaw` must keep every refusal of `read`. Logs must not include chunk text or heading text. `:repoId` must be workspace-checked before anything is queued.
- **Repo deletion mid-job.** The FK cascade plus swallowed write errors (G13): verify that no rows are re-created for a deleted repository.
- **Known flake.** The pre-existing `waitForPrRuns` race may flake the AC-12 integration case (server INSIGHTS 2026-10-12). It is not caused by this feature.
- No open user questions remain.

## 10. Could not determine

- The fallback design file `design/DevDigest Design (standalone) (3).html` is a bundled/encoded artifact; screen N6 could not be extracted by search. Screenshots 41 and 42 are the sources used. States beyond them reuse the existing muted footer style and the `IconBtn` look, per the spec.
- I did not read `server/docs/project-context.md` or `server/test/helpers/*`. Step 13 and the test steps rely on the implementer and test-writer reading them first.
- I did not verify the exact Drizzle version's `transaction(..., { isolationLevel, accessMode })` option names. If `accessMode` is unsupported, drop it and keep `isolationLevel: 'repeatable read'`.
- I did not check whether `MockGitClient.clone` returns a usable path for the AC-10 integration case. If not, the test overrides `git.clone` or `repoDocs`.

## 11. Requirements review

Questions asked, with the answers received. User: "accept ALL your defaults for Q1–Q9".
- Q1 `indexing` source: **accepted default**. In-memory in-flight registry; the persisted status is the last finished outcome (`ready`/`failed`, no row = `none`).
- Q2 `content_hash` when bytes were not read: **accepted default**. Nullable; null for `too_large` and I/O-unreadable; the hash is kept for non-UTF-8 and empty files.
- Q3 blank-line split: **accepted default**. Greedy packing up to 800 tokens; separators stay with the preceding piece; hard split at 3,200 code units, never through a surrogate pair; characters = UTF-16 units.
- Q4 footer with no previous index: **accepted default**. Indexing → single line "Re-indexing…" (live region); failed → shown as "Not indexed yet".
- Q5 layout: **accepted default**. The left panel is always rendered for a loaded repository; not-cloned / not-indexed / no-match empty states sit inside the list area; no footer when not cloned.
- Q6 repo-intel resync: **accepted default**. AC-10 literal (clone job only); the listing shows `stale` after a resync.
- Q7 error body: **accepted default**. Repo envelope `{ error: { code: "not_cloned" | "job_unavailable", message } }`; 202 body `{ status: "accepted", job_id }`.
- Q8 clone directory missing at request time: **accepted default**. 202, then the job fails with `clone_missing`; 409 only when no clone path is recorded.
- Q9 e2e verifications: **accepted default**. Client unit tests + manual browser checks; no `e2e/` change.
- Coordinator note: "subtitle stays the repository name (old AC-7); only Re-index in the header icon row (AC-19)." Reflected in step 20.

Gaps and conflicts found (see the round-1 review), all resolved in the steps:
- G1: the job timeout does not cancel the handler, and JobRunner retries → steps 7, 8.
- G2: two-statement listing reads → step 7.
- G3: no raw-bytes read → steps 3, 4.
- G4: BOM stripped → step 6, section 9.
- G5: single service instance → section 6, steps 10, 11.
- G6: `IconBtn` lacks disabled/description/spinner → step 19.
- G7: relative-time format → step 15.
- G8: ErrorState with data → step 21.
- G9: AC-16 vs AC-17 → step 17 (`gaveUp`).
- G10: second tab → section 9.
- G11: breaking tests → steps 22, 25.
- G12: server tests in `server/test/` → section 6.
- G13: delete during job → steps 7, 8.
- G14: `ProjectContextLog` lacks `info` → step 3.
- G15: unused `code_chunks` table not reused → step 1.
- G16: header icon row below the subtitle → step 20.

Recommendations, with the user's decision ("accept recommendations 1–8 as proposed"):
1. In-memory `indexing` + merging of duplicate requests (AC-3): **accepted** (steps 8, 9).
2. One-transaction swap + `repeatable read` listing read: **accepted** (step 7).
3. Pure chunker in `domain/chunking.ts`: **accepted** (step 5).
4. Promote the compact relative-time helper to `client/src/lib/relative-time.ts`: **accepted** (step 15).
5. `refetchInterval` polling every 2 s only while indexing: **accepted** (step 16).
6. Completion via baseline `indexed_at`/`failed_at` comparison: **accepted** (step 17).
7. The index job is never retried by JobRunner (non-retryable failure error): **accepted** (step 8).
8. Real `disabled` + `title` + `aria-describedby` for AC-18: **accepted** (step 19).

## 12. Execution mode

**multi-agent**. User: "Execution mode: multi-agent (user's choice)."

Agent sequence:
1. **implementer**, two parallel lanes:
   - Lane S: steps 1 → 2 → 3 → (4 ∥ 5) → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13.
   - Lane C: (14 ∥ 15 ∥ 18) → 16 → 17 → 19 → 20 → 21.
2. **test-writer**, two parallel lanes:
   - Lane S: steps 24, 25.
   - Lane C: steps 22, 23.
3. **check-runner**: every command in section 8 for `server/` and `client/`, plus manual browser checks M1 to M4.
4. **architecture-reviewer ∥ plan-verifier**. The architecture-reviewer focuses on the section 9 items (timeout window, single-process registry, `repeatable read` read, onion boundaries of `service.ts`/`indexer.ts`/`domain/`, `repos` → `projectContext` coupling via the container only). The plan-verifier checks the `Covers:` tags against the AC coverage table and the spec.

Lane C does not depend on lane S beyond the wire contract fixed in section 4. Browser checks M1 to M4 need both lanes merged.
