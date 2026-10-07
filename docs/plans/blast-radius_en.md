# Development Plan: Blast Radius (PR Overview block + `GET /pulls/:id/blast` + MCP tool)

Pipeline: **planner** (this plan) → **implementer** → (**architecture-reviewer** ∥ **plan-verifier**).
The PR description must include a short "Who did what" section that names each subagent and its
output: planner wrote this plan, implementer wrote the code and tests, architecture-reviewer
reviewed layering/contracts, plan-verifier checked the result against this plan.

## 1. Goal & scope

**Goal.** Show reviewers what else in the repo a PR can affect. The data comes only from the
precomputed repo-intel index:
1. the symbols declared in the changed files,
2. who calls or imports them (`file:line`),
3. the HTTP endpoints and crons that sit in those caller files.

The feature never re-analyzes the repo and never calls a model. The same answer is served to the
browser (Overview tab) and to Claude Code (MCP `devdigest_get_blast_radius`).

**In scope (MVP):**
- Server: new module `server/src/modules/blast/` with `GET /pulls/:id/blast`. It reads the PR's
  persisted changed files, makes one `repoIntel.getBlastRadius` call, and maps the flat `BlastResult`
  to the grouped `BlastRadius` contract. It also returns `degraded` + `reason` honestly.
- Client: a "Blast radius" card on the Overview tab, using the **Tree** design (screenshots 2.png /
  3.png):
  - a stat row (symbols · callers · endpoints · cron),
  - collapsible symbol rows with an "N callers" badge,
  - `↳ file:line` caller rows that link to the GitHub blob,
  - endpoint chips (blue) and cron chips (amber),
  - an empty state and a degraded state.
  The card sits in the right column next to the Intent card (2.png layout).
- MCP: replace the `devdigest_get_blast_radius` stub with a read-only call to `GET /pulls/:id/blast`.
  > Superseded by addendum: MCP is deferred (out of scope for this pass); §7 steps 13–15 and 15's docs are parked.

**Optional (separate steps, blocked until the user confirms, see Q1):**
- The **Graph** view (4.png) and the Tree/Graph toggle.
  > Superseded by addendum: Graph + toggle are built; verify only (A1, B2).

**Non-goals:**
- "Prior PRs touching these files". It is marked "Optional" in red in 2.png, and 7.png only shows it
  expanded. Not built.
  > Superseded by addendum: Prior PRs is now in scope (A1, A7 steps A-4…A-12).
- The "Review focus — read these first" block and the card above Intent in 2.png. Not part of
  this feature.
- Any change to repo-intel itself (facade, pipeline, constants), re-indexing, LLM calls, or a DB
  schema/migration.
- Editing `*/vendor/shared/**` (the `BlastRadius` contract stays as is; see §4 and Q2).

## 2. Context read

Files read:
- Root `CLAUDE.md`; `server/AGENTS.md`, `client/AGENTS.md`, `mcp/AGENTS.md`.
- `INSIGHTS.md` files: root, `server/`, `client/`, `mcp/`.
- `server/src/modules/repo-intel/{types,constants,service,repository,routes,index}.ts`, `README.md`.
- `server/src/modules/intent/{routes,ports,repository,schemas}.ts`,
  `server/src/modules/translation/{routes,service,ports}.ts`, `server/src/modules/pulls/routes.ts`,
  `server/src/modules/_shared/{context,schemas}.ts`, `server/src/modules/index.ts`,
  `server/src/platform/container.ts`.
- `server/vitest.config.ts`, `server/test/translation.it.test.ts`,
  `server/test/repo-intel-facade-degraded.test.ts`, `server/test/routes-smoke.test.ts`.
- `server/src/vendor/shared/contracts/brief.ts` (the `BlastRadius` contract).
- `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`, `OverviewTab/{OverviewTab.tsx,styles.ts}`,
  `IntentCard/{IntentCard.tsx,styles.ts}`, `SmartDiffGroups.test.tsx`.
- `client/src/lib/{github-urls.ts, hooks/keys.ts, hooks/index.ts, hooks/intent.ts, hooks/repo-intel.ts}`,
  `client/src/i18n/request.ts`, `client/messages/en/{blast,brief}.json`.
- `mcp/src/tools/{get-blast-radius.ts, get-blast-radius.test.ts, get-findings.ts, get-conventions.ts,
  schemas.ts, deps.ts}`, `mcp/src/gateway/{ports,api-schemas,http-gateway}.ts`,
  `mcp/src/lib/resolve.ts`, `mcp/src/server.test.ts`, `mcp/test/helpers/fake-gateway.ts`,
  `mcp/README.md`, `docs/plans/mcp-server_en.md` (grep only).
- Screenshots 2.png–7.png. Skills: onion-architecture, fastify-best-practices, zod,
  react-frontend-architecture, react-testing-library, design.

Verified facts about the starter code (with `path:line`):
- **Facade, persistent path.** `RepoIntelService.tryPersistentBlast` returns `degraded: false`
  for a `partial` index too (`server/src/modules/repo-intel/service.ts:320,384-390`). The facade
  therefore **never emits `index_partial`**.
- **Facade, flag off or no index.** It falls through to the ripgrep path, which always tags
  `reason: 'no_data'` and **never `flag_off`** (`service.ts:223-234,297-303`). That path has **no
  `factsByFile`**, so it has no crons and no per-file endpoint attribution.
- **Caller cap is global, not per symbol.** `callers.slice(0, MAX_CALLERS_PER_SYMBOL)` is applied
  to the whole caller list (`service.ts:386`). A PR gets at most 20 callers in total, not 20 per
  symbol. This is not changed in this feature (do-not-touch scope); we only disclose it (§9).
- **Callers are cross-file by construction.** `references.decl_file` is resolved through
  `file_edges` imports (`repo-intel/repository.ts:400-425`). Callers are inner-joined with
  `file_rank` (`repository.ts:503-531`), so a caller file without a rank row is dropped.
- **Changed files for a PR live in `pr_files`.**
  - `GET /pulls/:id` refreshes them from GitHub when a token exists (`pulls/routes.ts:227-242`).
  - Otherwise the persisted rows are served.
  - `IntentRepository.listPrFiles` already reads `pr_files` (`intent/repository.ts:90-95`).
- **The client Overview tab renders only after `usePullDetail` resolves** (`page.tsx:101-140`).
  So by the time the blast query fires, `GET /pulls/:id` has already refreshed `pr_files`.
- **Server tests live in `server/test/`.** Vitest includes `test/**/*.test.ts` and
  `src/**/*.test.ts` (`server/vitest.config.ts:14`). Every existing module test is under
  `server/test/` (e.g. `translation.it.test.ts`, `translation-helpers.test.ts`).
- **The MCP tool description is user-approved verbatim** and is pinned by
  `mcp/src/server.test.ts:47`. Annotations are pinned at `server.test.ts:29-32`. Test 7 at
  `server.test.ts:112-117` pins the stub.
- **i18n.** `client/messages/en/blast.json` already exists and is auto-loaded per namespace
  (`client/src/i18n/request.ts:16-25`). `brief.json` has `block.blast: "Blast radius"`.

Relevant INSIGHTS entries (quoted):
- `INSIGHTS.md` (root), Codebase Patterns 2026-09-18: "`server/src/vendor/shared` and
  `client/src/vendor/shared` are meant to be the same contracts package but there is no sync script
  between them … Diff both copies before trusting either."
- `INSIGHTS.md` (root), Tool & Library Notes 2026-09-25: "`implementer-guard.sh`'s Edit/Write block
  on `*/vendor/shared/**` has no exception for a plan that explicitly sanctions one specific line."
  (This is relevant only if Q2 resolves to editing the contract.)
- `INSIGHTS.md` (root), Decisions 2026-09-18: "Invoke best-practices skills proactively during
  implementation … checked against every file touched in a task."
- `server/INSIGHTS.md`, Codebase Patterns 2026-09-20: "Per-agent skill counts are a separate
  `GET /agents/skill-counts` … rather than a field on `Agent`, because `vendor/shared` contracts are
  do-not-touch." This is the precedent for a module-local response schema.
- `server/INSIGHTS.md`, Recurring Errors 2026-09-24: "`*.it.test.ts` suites build
  `loadConfig(process.env)`, so `LocalSecretsProvider` reads the developer's REAL
  `~/.devdigest/secrets.json`." The blast route makes no LLM or GitHub calls, so this does not bite,
  as long as the blast route stays pure-read.
  > Superseded by addendum: the module now calls GitHub (changed-files fallback, and the new history route), so `.it` tests must override the GitHub-backed ports (A6, step A-11).
- `client/INSIGHTS.md`, Tool & Library Notes 2026-09-20: "`@testing-library/user-event` is NOT a
  client dependency … component tests use the `fireEvent`-based shim `src/test/user.ts`."
- `client/INSIGHTS.md`, Codebase Patterns 2026-09-18: "No Popover/Tooltip primitive exists anywhere
  under `src/vendor/ui/kit/`." There is no tree or graph primitive either, so build them from plain
  elements/SVG.
- `mcp/AGENTS.md`: "Model-facing texts (tool descriptions, `instructions`) are user-approved
  verbatim; change them only via the plan." Also: "API responses are `safeParse`d against the
  minimal schemas in `src/gateway/api-schemas.ts`; do not vendor `@devdigest/shared` here."
- `mcp/INSIGHTS.md`: nothing specific to blast radius.

## 3. Affected modules

**server/**

New module `src/modules/blast/`:

| File | Status | What it holds |
|---|---|---|
| `ports.ts` | NEW | Plain TS only. `BlastPull { prId; repoId; headSha }`; `BlastPullReader { getPull(workspaceId, prId): Promise<BlastPull \| undefined>; listChangedPaths(prId): Promise<string[]> }`; `BlastIntel = Pick<RepoIntel, 'getBlastRadius' \| 'getIndexState'>` (type-only import from `../repo-intel/index.js`); `BlastReason`; `BlastRadiusView`; `BlastReader { get(workspaceId, prId): Promise<BlastRadiusView> }`. |
| `helpers.ts` | NEW | Pure mapping: `groupCallers`, `collectFacts`, `buildSummary`, `deriveDegradation`, `toBlastRadiusView`. No I/O. |
| `service.ts` | NEW | `BlastService implements BlastReader`. Takes deps `{ pulls: BlastPullReader; intel: BlastIntel; intelEnabled: () => boolean }`. |
| `repository.ts` | NEW | `BlastRepository implements BlastPullReader` (Drizzle; `pull_requests` + `pr_files`). |
| `schemas.ts` | NEW | Zod `BlastReasonSchema`, `BlastRadiusResponse = BlastRadius.extend({...})`. |
| `routes.ts` | NEW | `GET /pulls/:id/blast`. |

Modified server files:
- `src/modules/index.ts` (MODIFIED): register `blast`.
- `src/platform/container.ts` (MODIFIED): lazy `get blast(): BlastReader`.
- `test/blast-helpers.test.ts` (NEW): unit tests for the pure mapping.
- `test/blast-service.test.ts` (NEW): unit tests for the service with fake ports, no DB.
- `test/blast.it.test.ts` (NEW): integration test with Testcontainers.

**client/**

Modified and new lib files:
- `src/lib/hooks/blast.ts` (NEW): `useBlastRadius(prId)` plus the local `BlastRadiusResponse` type.
- `src/lib/hooks/keys.ts` (MODIFIED): `prBlast(prId)` key.
- `src/lib/hooks/index.ts` (MODIFIED): `export * from "./blast"`.

New component folder `src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/`:

| File | Status | What it holds |
|---|---|---|
| `BlastRadiusCard.tsx` | NEW | Card shell: header, stat row, states, Tree view. |
| `helpers.ts` | NEW | Pure: `blastStats(data)`, `isCron`/label helpers if needed. |
| `constants.ts` | NEW | Default-expanded rule, chip kinds. |
| `styles.ts` | NEW | Co-located styles. |
| `index.ts` | NEW | Re-exports `BlastRadiusCard`. |
| `BlastRadiusCard.test.tsx` | NEW | Component test. |
| `helpers.test.ts` | NEW, optional | Only if helpers are non-trivial. |
| `_components/SymbolTree/SymbolTree.tsx` + `index.ts` | NEW | Tree rows. Split out only if `BlastRadiusCard.tsx` passes ~150 lines. |
| `_components/BlastGraph/…` | NEW, **OPTIONAL** | Q1. |

Other client files:
- `OverviewTab/OverviewTab.tsx` and `OverviewTab/styles.ts` (MODIFIED):
  - put Intent and Blast in a 2-column grid,
  - pass `repoFullName` and `headSha`,
  - keep the Description below.
- `page.tsx` (MODIFIED): pass `repoFullName` and `pr.head_sha` to `OverviewTab`.
- `messages/en/blast.json` (MODIFIED): add the missing state strings (§7 step 9). Existing keys stay
  unchanged.

**mcp/**
- `src/gateway/ports.ts` (MODIFIED): `BlastRecord` types and `blastRadius(prId)` on `DevDigestGateway`.
- `src/gateway/api-schemas.ts` (MODIFIED): `ApiBlastRadius` minimal schema.
- `src/gateway/http-gateway.ts` (MODIFIED): `blastRadius(prId)` → `GET /pulls/:id/blast`.
- `src/tools/schemas.ts` (MODIFIED): replace `BlastRadiusStubShape` with `BlastRadiusShape`.
- `src/tools/get-blast-radius.ts` (MODIFIED): the real handler.
- `src/tools/get-blast-radius.test.ts` (MODIFIED): new tests.
- `src/server.test.ts` (MODIFIED): description text (1b), annotations (1, if Q5 changes them),
  flow 7.
- `test/helpers/fake-gateway.ts` (MODIFIED): `blast` state and `blastRadius()`.
- `src/gateway/http-gateway.test.ts` (MODIFIED): mapping and 404 case for the new method.
- `README.md` (MODIFIED): tool table row and read-only note.

**docs/**
- `docs/plans/mcp-server_en.md`: no change. That plan is historical, and its stub decision is
  superseded by this plan.

## 4. Contracts touched

- **`BlastRadius` in `*/vendor/shared/contracts/brief.ts`: read-only, NOT edited.** It has no
  `degraded`/`reason` field. Recommended resolution (pending Q2): a **module-local response schema**
  that extends the vendored one, following the `skill-counts` precedent:
  ```ts
  // server/src/modules/blast/schemas.ts
  export const BlastReasonSchema = z.enum([
    'flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data', 'no_changed_files',
  ]);
  export const BlastRadiusResponse = BlastRadius.extend({
    degraded: z.boolean(),
    reason: BlastReasonSchema.nullable(),
    /** Commit the index (and so every caller line) was built from; null when unknown. */
    ref_sha: z.string().nullable(),
  });
  ```
  - The first five reasons mirror repo-intel's `DegradedReason`.
  - `no_changed_files` is blast-local: the PR has no persisted `pr_files` rows.
  - If the user prefers to change the shared contract instead, see Q2. In that case:
    - the edit happens identically in **both** vendored copies, via the sanctioned workaround
      described in root INSIGHTS (2026-09-25),
    - verify with `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts`,
    - the module-local schema is then dropped.
- **Server-local types** (`modules/blast/ports.ts`): `BlastRadiusView` = the `BlastRadius` type
  (type-only import from `@devdigest/shared`) & `{ degraded; reason; ref_sha }`. The snake_case
  keys match the wire contract.
- **New API:** `GET /pulls/:id/blast`.
  - `params: IdParams` (uuid).
  - `response: { 200: BlastRadiusResponse }`.
  - 404 `NotFoundError('Pull request not found')` when the PR is not in the caller's workspace.
  - 422 on a non-uuid id (existing envelope).
  - Never 5xx for missing or failed index data (the facade never throws).
- **Client type** (`client/src/lib/hooks/blast.ts`): `type BlastRadiusResponse = BlastRadius & {
  degraded: boolean; reason: BlastReason | null; ref_sha: string | null }`.
  - `BlastRadius` is a type import from the client's vendored `@devdigest/shared`.
  - The response is module-local on the server and mirrored here, same as `hooks/intent.ts`.
  - Before relying on it, the implementer runs
    `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts`.
    If the copies differ in the Blast block, stop and raise it.
- **MCP:** `ApiBlastRadius` minimal Zod schema in `mcp/src/gateway/api-schemas.ts` (not vendored).
  It is mapped to the MCP-owned `BlastRecord` in `ports.ts`.
- **DB schema / migrations:** none.

## 5. Skills for implementer

| Skill | Governs | Key rules for this task |
|---|---|---|
| onion-architecture | Steps 1–6 (server module, container) | `service.ts`/`ports.ts`/`helpers.ts` import no `fastify`, `drizzle-orm` or `zod` (type-only `@devdigest/shared` and repo-intel `index.ts` types are fine). The service takes **narrow ports via constructor**, not `Container`. Do not import repo-intel's `repository`/`constants`/`helpers`; go through `container.repoIntel` only. The repository returns mapped plain objects, never `$inferSelect` rows. |
| fastify-best-practices | Step 5 (`routes.ts`), step 6 (registration) | The route parses, calls one service method and returns. No SQL in the route. Declare `params` + `response` schemas via `fastify-type-provider-zod` (do not hand-roll `.parse`). Errors are thrown as `NotFoundError` and mapped centrally. |
| zod | Step 4 (`schemas.ts`), MCP steps 13–15 | Use `.extend()` to compose on the vendored `BlastRadius`, and `z.enum` for reasons. Use `.nullable()` (not `.optional()`) for always-present fields. On the MCP side, `safeParse` at the boundary (the gateway already does this) and keep the schema minimal. |
| drizzle-orm-patterns | Step 3 (`repository.ts`) | Two simple selects scoped by `workspaceId` (PR) and `prId` (files). Select explicit columns only. No new tables. |
| react-frontend-architecture | Steps 7–12 | The card is a PascalCase folder under `_components/` with lowercase siblings and an `index.ts` that re-exports only the component. Data goes through `src/lib/hooks/blast.ts` → `api.ts`; the component never calls `fetch`. Strings come from `messages/en/blast.json`. Tree open/closed is local `useState`. |
| react-best-practices | Steps 10–12 | Derive the stats during render (no `useEffect`). Use stable keys (`symbol`, `file:line`). Do not copy server data into state. |
| react-testing-library | Step 12, step 13-client | Few, flow-style tests. Query by role/text. Use the `src/test/user.ts` shim, because user-event is not installed (client INSIGHTS). Mock at the API boundary (`fetch`) as the existing tests do. |
| design | Steps 9–11, browser check | The screenshots win. Fall back to the `design/` HTML only for what they do not show; never `Read` it whole (grep or open it in a browser). Do not add visuals (no caller-name column, no Prior PRs). |
| security | Steps 5, 10, 14 | Repo-derived strings (file paths, symbol names, endpoints, cron names) are untrusted. Render them as React text only, never `dangerouslySetInnerHTML`. Build GitHub links only via `githubBlobUrl` (it encodes path segments), with `target="_blank" rel="noopener noreferrer"`. In MCP, pass every string through `sanitizeText`. The route stays workspace-scoped through `getContext`. |
| typescript-expert | Steps 1, 7, 13 | Type-only imports for the cross-module and shared types. No `any`. |

> Superseded by addendum: the design row's "no Prior PRs" no longer holds; see A5 for the addendum skill table.

Not applicable: postgresql-table-design (no schema change), next-best-practices (no new route or
RSC boundary; the card is a client leaf inside an existing `"use client"` page).

## 6. Architecture constraints

- **Server layering.** `routes.ts` → `service.ts` → `repository.ts` in `src/modules/blast/`, plus
  `ports.ts`, `helpers.ts` and `schemas.ts`. Do not collapse the split.
  - Composition happens only in `platform/container.ts`.
  - Cross-module access to repo-intel goes only through `container.repoIntel` (the facade),
    injected as the narrow `BlastIntel` port.
- **No re-analysis, no model.** The blast module must not touch:
  - `container.codeIndex`, `container.git`, `container.github()` or `container.llm()`,
  - the clone on disk.
  It reads `pr_files` + `pull_requests` and calls `repoIntel.getBlastRadius` **once** per request.
  It also calls `repoIntel.getIndexState` once, a single-row read (see Q3).
  > Superseded by addendum: `container.github()` (changed-files fallback, already built) and a new GitHub-backed `PriorPrSource` (history route only) are now allowed; still no codeIndex/git/llm/clone (A6).
- **Client.**
  - Feature UI goes in `_components/BlastRadiusCard/`.
  - Nested parts go in `BlastRadiusCard/_components/<Name>/`.
  - Data goes through `src/lib/hooks/blast.ts`.
  - i18n goes in `messages/en/blast.json` (the `brief` namespace for the card title).
- **MCP.**
  - `tools/*` depend only on the `DevDigestGateway` port.
  - `fetch` lives only in `http-gateway.ts`.
  - Every handler is wrapped in `guarded` (`safeHandler`).
  - Arguments stay flat and scalar (`repo`, `pr`).
  - Nothing goes to stdout.
  - The tool set stays at exactly 5 tools.
- **Do-not-touch:**
  - `*/vendor/shared/**` (unless Q2 says otherwise),
  - `client/src/vendor/ui/**`,
  - `server/src/db/migrations/**`,
  - every `pnpm-lock.yaml` (no new dependencies: build the Graph, if approved, with plain SVG),
  - `server/src/modules/repo-intel/**` (consumed, not changed).
- **Tests.**
  - Client tests are co-located (`<Name>.test.tsx`).
  - Server tests follow the existing package convention: they live in `server/test/` with
    `<name>.test.ts` / `<name>.it.test.ts`. vitest only picks up `test/**` and `src/**`, and every
    module test already lives in `test/`. Flagged in §9 as a known deviation from the root
    "co-located" wording.

## 7. Steps

**Server**

1. **`server/src/modules/blast/ports.ts`** (onion-architecture, typescript-expert)
   - Declare `BlastPull`, `BlastPullReader`, `BlastIntel`, `BlastReason`, `BlastRadiusView` and
     `BlastReader` as listed in §3.
   - `BlastReason` is the union `'flag_off' | 'index_failed' | 'index_partial' | 'repo_too_large' |
     'no_data' | 'no_changed_files'`.
   - Use type-only imports: `RepoIntel` from `../repo-intel/index.js` and `BlastRadius` from
     `@devdigest/shared`.

2. **`server/src/modules/blast/helpers.ts`** (onion-architecture). All functions are pure.
   - `groupCallers(result: BlastResult): DownstreamImpact[]`
     - Order the groups by first appearance of the symbol name in `result.changedSymbols`. Any
       `viaSymbol` not present there is appended in first-seen order.
       > Superseded by addendum step A-3: groups are ordered by rank (max caller rank desc), changed-symbol order is only the final tie-break.
     - One group per distinct `viaSymbol`. Each caller maps as
       `{ name: c.symbol, file: c.file, line: c.line }`.
     - Keep the facade order (already rank-desc).
     - Dedupe on `file|line|name`.
     - Groups with zero callers are **not** emitted. The UI stat row uses `changed_symbols.length`
       for the "symbols" count, matching 5.png ("14 symbols" with only 4 cards).
   - `collectFacts(callers, factsByFile)` → `{ endpoints_affected, crons_affected }`
     - Take the union over the group's caller files of `factsByFile[file].endpoints` / `.crons`.
     - Dedupe while preserving first-seen order.
     - When `factsByFile` is undefined (ripgrep/degraded path), return `[]` for both. Do **not**
       attribute the flat `impactedEndpoints` to a symbol, because that would be a guess.
   - `buildSummary(view)`: an English string made from numbers only. Use the same counting rules as
     the client (step 10):
     - `symbols` = `changed_symbols.length`,
     - `callers` = the sum of `downstream[].callers.length`,
     - `endpoints` / `crons` = the unique union across groups.
     Format: `"2 symbols · 14 callers · 3 endpoints · 1 cron"`. Singular and plural are handled
     per noun.
     - Append `" (index incomplete: <reason>)"` when degraded.
     - When there are no callers, return `"<n> changed symbol(s), no downstream callers found."`,
       which mirrors `blast.json` `noDownstream`.
   - `deriveDegradation({ result, state, intelEnabled })` → `{ degraded, reason }`. Rules, in order:
     1. `!intelEnabled` → `{ true, 'flag_off' }`.
     2. `result.degraded !== true && state.status === 'partial'` → `{ true, 'index_partial' }`.
        The data is kept.
     3. `result.degraded === true && state.status === 'failed'` → `{ true, 'index_failed' }`.
     4. `result.degraded === true` → `{ true, result.reason ?? 'no_data' }`.
     5. Otherwise `{ false, null }`.
   - `toBlastRadiusView(result, state, intelEnabled)` assembles everything:
     - `changed_symbols` = `result.changedSymbols` mapped to `{ name, file, kind }`,
     - `ref_sha` = `state.lastIndexedSha || null`.

3. **`server/src/modules/blast/repository.ts`** (drizzle-orm-patterns, onion-architecture)
   - `BlastRepository implements BlastPullReader`, with `constructor(private db: Db)`.
   - `getPull(workspaceId, prId)`:
     - select `{ id, repoId, headSha }` from `t.pullRequests`,
     - where `workspaceId` and `id` match,
     - map to `BlastPull` or return `undefined`.
   - `listChangedPaths(prId)`: select `t.prFiles.path` where `prId` matches → `string[]`.
   - Keep imports local, mirroring `intent/repository.ts:68-95`.

4. **`server/src/modules/blast/schemas.ts`** (zod)
   - Define `BlastReasonSchema` and `BlastRadiusResponse` exactly as in §4.
   - Import `BlastRadius` from `@devdigest/shared`.
   - Export the inferred type.

5. **`server/src/modules/blast/service.ts` and `routes.ts`** (onion-architecture,
   fastify-best-practices)
   - `BlastService.get(workspaceId, prId)`:
     1. `pull = await pulls.getPull(...)`. If it is missing, throw `NotFoundError('Pull request not
        found')` from `platform/errors.js`. This is the same pattern as `translation/service.ts:66`.
     2. `paths = await pulls.listChangedPaths(pull.prId)`.
     3. If `paths.length === 0`, return an empty view with `degraded: true`,
        `reason: 'no_changed_files'`, `ref_sha: null` and the summary. Do **not** call the facade.
     4. Otherwise run `const [result, state] = await Promise.all([intel.getBlastRadius(pull.repoId,
        paths), intel.getIndexState(pull.repoId)])`.
     5. Return `toBlastRadiusView(result, state, intelEnabled())`.
   - `routes.ts`:
     - `app.get('/pulls/:id/blast', { schema: { params: IdParams, response: { 200:
       BlastRadiusResponse } } }, async (req) => { const { workspaceId } = await getContext(container,
       req); return container.blast.get(workspaceId, req.params.id); })`.
     - Add a header comment listing the route, noting "pure read: no LLM, no GitHub, no writes".

6. **Wiring** (onion-architecture)
   - In `server/src/platform/container.ts`, add `private _blast?: BlastReader` and:
     ```ts
     get blast(): BlastReader {
       return (this._blast ??= new BlastService({
         pulls: new BlastRepository(this.db),
         intel: this.repoIntel,
         intelEnabled: () => this.config.repoIntelEnabled,
       }));
     }
     ```
     The getter goes through `this.repoIntel`, so `ContainerOverrides.repoIntel` mocks flow through
     in tests.
   - In `server/src/modules/index.ts`, add `import blast from './blast/routes.js'` and a `blast`
     entry.

**Client**

7. **`client/src/lib/hooks/blast.ts`, `keys.ts`, `index.ts`** (react-frontend-architecture)
   - Add `prBlast: (prId) => ["pr-blast", prId] as const` to `queryKeys`.
   - `useBlastRadius(prId)`:
     `useQuery({ queryKey: queryKeys.prBlast(prId), queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`), enabled: !!prId })`.
   - Export the `BlastRadiusResponse` and `BlastReason` types.
   - Add a header comment like `hooks/intent.ts`: "pure read; response shape is module-local on
     the server, mirrored here".
   - No invalidation wiring is needed for the MVP. The index changes only on resync; see Q7.
     > Superseded by addendum step A-14: resync-completion invalidation is now required (button in the card).

8. **`page.tsx` and `OverviewTab`** (react-frontend-architecture, design)
   - `page.tsx:140` becomes
     `<OverviewTab prId={prId} prBody={pr.body} repoFullName={repoFullName} headSha={pr.head_sha} />`.
   - `OverviewTab.tsx` wraps `<IntentCard>` and `<BlastRadiusCard>` in a two-column grid. This is
     2.png: Intent on the left, Blast radius on the right, equal widths, the cards stretch to equal
     height.
   - The Description section stays below, unchanged.
   - Add a `briefGrid` style to `OverviewTab/styles.ts`:
     `{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "stretch" }`.
     Measure the gap against 2.png. Use the `design/` file only if it differs.

9. **`client/messages/en/blast.json`** (design). Keep all existing keys. Add only what the states
   need; the user may adjust the copy:
   - `"degraded": { "title": "Repo index incomplete", "flag_off": "Repo intelligence is turned off — the map may be empty or partial.", "index_failed": "Indexing this repo failed — the map may be incomplete.", "index_partial": "The repo index is partial — some callers may be missing.", "repo_too_large": "This repo is too large to index fully — the map may be incomplete.", "no_data": "This repo has not been indexed yet — callers, endpoints and crons may be missing.", "no_changed_files": "No changed files are recorded for this PR yet." }`
   - `"error": "Couldn't load the blast radius."`, `"retry": "Retry"`
   - `"callerOne": "1 caller"`. 5.png shows "1 caller"; 3.png uses `callerCount`. Or switch
     `callerCount` to ICU plural if the user agrees, since changing an existing key's text needs the
     user's OK.
   - `"truncatedNote"`: only if Q4 says to disclose the 20-caller cap.
   - The card title comes from `brief.block.blast` ("Blast radius"). Render it uppercase via the
     same label style as IntentCard.

10. **`BlastRadiusCard/` (MVP: Tree view)** (react-frontend-architecture, react-best-practices,
    design, security)
    - **Props:** `{ prId: string | null | undefined; repoFullName: string | null; headSha: string }`.
    - **Card shell:** copy the IntentCard card/header/label pattern (same border, radius 10,
      padding 18, gap 14, uppercase muted label).
      - The header icon is the 2.png "two linked squares" glyph. The exact `Icon.*` name is
        unverified; see §10.
    - **Stat row** (2.png/3.png): computed in `helpers.ts` → `blastStats(data)`, using the same
      rules as the server summary.
      - Four items: `<> N symbols`, `↳ N callers`, `globe N endpoints`, `clock N cron`. The number
        is bold and the label muted, using `blast.stat.*`.
      - **Label mismatch:** `blast.stat.crons` is "cron/jobs" but 3.png shows "cron". Follow the
        screenshot and ask (Q8).
      - Hide the endpoints/cron items when their count is 0? Unverified. Default: always show all
        four, as in 2.png.
    - **Tree** (3.png):
      - One row per `downstream` group: chevron, blue `<>` icon, `symbol()` in mono bold, and the
        right-aligned muted "N callers".
      - The row is a `<button aria-expanded>` that toggles open/closed with local `useState`.
      - Default: the first group expanded, the rest collapsed (3.png). Put the rule in
        `constants.ts`.
      - Expanded body:
        - caller lines `↳ file:line` in mono muted, with a vertical guide line. Each one is an
          `<a href={githubBlobUrl(repoFullName, ref, file, line)} target="_blank" rel="noopener
          noreferrer">`, where `ref = data.ref_sha ?? headSha` (Q6),
        - then endpoint chips (globe icon, blue tint background, mono text),
        - then cron chips (clock icon, amber tint, mono text),
        - in the screenshot order: callers, endpoint chips, cron chips.
        > Superseded by addendum step A-15: endpoint chips and cron chips render in two separate rows.
      - When `repoFullName` is null, render `file:line` as plain text (no link).
    - **States:**
      - loading: skeleton lines, as in IntentCard;
      - query error: muted `role="alert"` text plus a Retry button calling `refetch`;
      - `downstream.length === 0` and not degraded: the `blast.noDownstream` text with
        `count = changed_symbols.length`;
      - `degraded === true`: a muted notice from `blast.degraded.title` +
        `blast.degraded[reason]`, shown **above** whatever data exists. For `index_partial` the
        tree still renders; for an empty degraded result only the notice shows.
    - Render every repo-derived string as text. No HTML injection.

11. **OPTIONAL (blocked on Q1): Tree/Graph toggle + `BlastGraph`** (design, react-best-practices)
    - Segmented toggle `Tree | Graph` at the right end of the stat row (2.png). Use
      `blast.view.*`, local state, Tree as the default.
    - `_components/BlastGraph/BlastGraph.tsx`: an SVG with three columns (4.png):
      - changed symbols (blue border), then caller nodes labelled by caller `name` (deduped per
        symbol), then endpoint nodes (blue border, ellipsis-truncated),
      - curved edges between them (symbol→caller, caller→endpoint, the endpoint taken from the
        caller file's facts),
      - a legend: changed symbol / callers / endpoints affected,
      - `aria-label` = `blast.graph.ariaLabel`, with `blast.graph.empty` when there are no
        callers.
    - Per-caller endpoint attribution needs `file → endpoints`, which the contract does not carry
      per caller. Approximation: link a caller to every endpoint of its group. Q1b.
    - Do not add a graph library (lockfile is do-not-touch).
    - If Q1 is "no", skip this step and **omit the toggle entirely**. A dead toggle would be worse
      than none.

12. **Client tests** (react-testing-library)
    - `BlastRadiusCard.test.tsx`: render it in `NextIntlClientProvider` with `{ blast, brief }`
      messages (pattern: `SmartDiffGroups.test.tsx:13-19`) inside a `QueryClientProvider`, and mock
      `fetch` as the existing hook-backed tests do. Three flows:
      1. **Happy path.**
         - The stat row shows "2 symbols", "6 callers", "3 endpoints", "1 cron".
         - The first symbol is expanded with its `file:line` links: assert `href` equals
           `githubBlobUrl(...)` with `ref_sha`, plus `target="_blank"`.
         - Endpoint and cron chips are visible.
         - Clicking the collapsed second symbol (via `src/test/user.ts`) reveals its callers.
      2. **No callers.** The `noDownstream` text shows and there is no tree.
      3. **Degraded `no_data`, empty.** The degraded notice shows. Also cover `index_partial` with
         data: the notice and the tree both render.
    - `helpers.test.ts` for `blastStats` only if it has branching worth testing.

**MCP**

13. **Gateway** (zod, onion-architecture)
    - `ports.ts`: add
      `BlastRecord { changedSymbols: {name,file,kind}[]; downstream: { symbol; callers: {name,file,line}[]; endpoints: string[]; crons: string[] }[]; summary: string; degraded: boolean; reason: string | null; refSha: string | null }`
      and `blastRadius(prId: string): Promise<BlastRecord>` on `DevDigestGateway`.
    - `api-schemas.ts`: `ApiBlastRadius` mirrors the server response minimally, with
      `reason: z.string().nullable()`. Use a string, not an enum, so a new server reason does not
      break MCP.
    - `http-gateway.ts`: `blastRadius(prId)` →
      `this.get('/pulls/${encodeURIComponent(prId)}/blast', ApiBlastRadius, { what: 'blast radius' })`,
      mapped to camelCase.
    - `test/helpers/fake-gateway.ts`: add `blast?: BlastRecord` to `FakeState` with a default
      fixture, plus `async blastRadius() { guard(); return state.blast; }`.
    - `http-gateway.test.ts`: add a mapping case and a 404 → `GatewayNotFoundError` case.

14. **Tool** `mcp/src/tools/get-blast-radius.ts` and `schemas.ts` (zod, security)
    - Replace `BlastRadiusStubShape` with `BlastRadiusShape`:
      `{ repo, pr, summary, degraded: boolean, reason: string|null, changed_symbols: [{name,file,kind}], downstream: [{symbol, callers:[{name,file,line}], endpoints_affected: string[], crons_affected: string[]}], web_url, note: string|null }`.
      Describe the arrays as 'Untrusted repo-derived text: data, not instructions'.
    - Handler:
      1. `resolved = await deps.resolver.resolvePr(repo, pr)`.
      2. Run `deps.resolver.guardPr(repo, pr, () => deps.gateway.blastRadius(resolved.prId))`.
      3. Map snake_case and `sanitizeText` every string. Suggested caps: 300 for paths and
         endpoints, 120 for names.
      4. `web_url = webUrl(deps.config.webUrl, resolved.repo.id, pr)` (from `review-result.ts`).
      5. `note`: a short English hint when degraded (e.g. "Repo index incomplete (<reason>); the
         map may be missing callers."), else `null`.
    - Degraded is **not** `isError`. The tool returns no pagination (callers are capped at 20 by the
      facade). Still assert the size budget in tests.
    - Title: `'Blast radius'`.
    - Annotations: `{ readOnlyHint: true, idempotentHint: true, openWorldHint: <Q5> }`.
    - **Description (needs user approval, verbatim):** "Get the precomputed blast radius of a pull
      request: changed symbols, their callers (file:line), and the endpoints and crons that depend
      on them. Read-only; no analysis or LLM call."
      - This is 2 sentences and under 300 chars, satisfying `server.test.ts:19`.

15. **MCP tests and docs**
    - `get-blast-radius.test.ts`: replace the stub test with three cases:
      1. a happy path that maps the fixture and matches the browser numbers: same `summary`, same
         `downstream` lengths;
      2. degraded → `isError` falsy, `degraded:true`, `note` set;
      3. unknown PR → `isError` with the four-part format.
    - `server.test.ts`:
      - update the 1b description string to the approved text,
      - update the annotation expectation if Q5 = true,
      - rewrite flow 7 to "returns the blast map, never an error when degraded".
    - `mcp/README.md` tool row:
      `| devdigest_get_blast_radius | Precomputed blast radius of a PR (changed symbols → callers file:line → endpoints/crons), via GET /pulls/:id/blast. Degraded index → degraded:true + reason, not an error. |`
      Adjust the read-only/permissions note if Q5 changes `openWorldHint`.

**Server tests**

16. **`server/test/blast-helpers.test.ts`** (unit, no DB)
    - `groupCallers`:
      - grouping by `viaSymbol`,
      - symbol order follows `changedSymbols`,
      - an unknown `viaSymbol` is appended,
      - dedupe,
      - empty groups are dropped.
    - `collectFacts`:
      - the union per group's caller files,
      - `factsByFile` undefined → `[]`.
    - `buildSummary`: plural/singular, the no-callers sentence, the degraded suffix.
    - `deriveDegradation`: every rule in step 2.

17. **`server/test/blast-service.test.ts`** (unit, fake ports)
    - PR not found → `NotFoundError`.
    - No files → `no_changed_files` and the facade is **not** called (spy).
    - Files present → `getBlastRadius` is called **exactly once** with
      `(repoId, paths)`.
    - `partial` state → `index_partial` with the data preserved.

18. **`server/test/blast.it.test.ts`** (Testcontainers; pattern: `translation.it.test.ts`)
    - Seed a workspace, repo, PR and `pr_files`.
    - Build the app with `overrides: { repoIntel: fakeRepoIntel }`. The fake returns a fixed
      `BlastResult` and `IndexState`.
    - Assert that `GET /pulls/:id/blast`:
      - returns 200 with the grouped shape,
      - returns 404 for a foreign or unknown uuid,
      - returns 422 for a non-uuid id,
      - returns `degraded`/`reason` pass-through.
    - It is skipped automatically without Docker (`describe.skip`).

## 8. Acceptance checks

Use `npx --yes pnpm@10 <cmd>` if `pnpm` is not on PATH (root INSIGHTS).

```sh
# server
cd server && npx --yes pnpm@10 typecheck && npx --yes pnpm@10 test
# client
cd client && npx --yes pnpm@10 typecheck && npx --yes pnpm@10 test && npx --yes pnpm@10 lint
# mcp
cd mcp && npx --yes pnpm@10 typecheck && npx --yes pnpm@10 test
# contracts untouched / in sync
git diff --stat -- server/src/vendor client/src/vendor server/src/db/migrations '*/pnpm-lock.yaml'   # expect empty
diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts       # expect no diff
```

API check against the running stack (do not kill unfamiliar dev servers, see root INSIGHTS):

```sh
curl -s localhost:3001/pulls/<pr-uuid>/blast | jq '{summary, degraded, reason, n: (.downstream|length)}'
curl -s -o /dev/null -w '%{http_code}\n' localhost:3001/pulls/00000000-0000-4000-8000-000000000000/blast   # 404
```

Browser check. Land on `/` first and then click into the PR (client INSIGHTS deep-link note).
Compare against 2.png / 3.png:
1. On an indexed repo, open a PR → Overview. The Blast radius card sits right of Intent. The stat
   row numbers equal the `curl` summary. The first symbol is expanded, the others collapsed with
   "N callers".
2. Click a `file:line` → a new tab opens on github.com at `blob/<sha>/<file>#L<line>`, and that
   line is the call site.
3. On a PR whose changed files have no callers → the `noDownstream` text.
4. On an unindexed repo (or `REPO_INTEL_ENABLED=false`) → the degraded notice, not an empty card.
5. (If Q1 = yes) The Tree/Graph toggle works and the Graph matches 4.png.
6. Take a screenshot of the card and put it next to 3.png for review (design skill §Verification).

MCP check: in Claude Code at the repo root, ask "What is the blast radius of PR <n> in
<owner/name>?" The tool returns the same `summary` and the same symbol/caller list as the browser.
It is not flagged as an error when degraded.

## 9. Risks & open questions

**Open questions for the user** (the dependent steps are blocked until answered; defaults are
marked):
- **Q1 — MVP view.**
  - Recommended MVP: the **Tree** design of 2.png/3.png. It is the only variant that shows
    endpoints/crons under each symbol, which the brief requires, and it is the in-context Overview
    design.
  - The flat card list of 5.png/6.png lacks endpoints/crons and the toggle. Not planned unless the
    user prefers it.
  - Graph (4.png) + toggle: build now (step 11) or defer? *Default: defer and omit the toggle.*
  - **Q1b.** In the Graph, how is a symbol shown when there are several (4.png shows only one)? And
    can caller→endpoint edges be approximated per group?
- **Q2 — Where `degraded`/`reason` lives.** Module-local `BlastRadius.extend(...)` (recommended; no
  vendor edit), or add the fields to the shared `BlastRadius` at the sync source in both vendored
  copies? *Default: module-local.*
- **Q3 — Second facade read.** Is calling `repoIntel.getIndexState` once (besides the single
  `getBlastRadius`) acceptable? Without it, a `partial` index is reported as complete and we cannot
  provide `ref_sha`. *Default: yes.*
- **Q4 — Caller cap.** The facade caps callers at 20 **per PR**, not per symbol, despite the
  constant's name. Should the UI/MCP disclose truncation (e.g. "showing first 20 callers")? Fixing it
  would mean touching repo-intel, which is out of scope. *Default: no disclosure in the MVP; flag it
  to the repo-intel owner.*
- **Q5 — MCP `openWorldHint`.** `resolvePr` calls `GET /repos/:id/pulls`, which syncs from GitHub.
  `devdigest_get_findings` sets `openWorldHint: true` for this reason. Should blast match it
  (`true`)? The stub had `false`. *Default: `true`, for honesty.*
- **Q5b — MCP description text.** Approve the verbatim text in step 14.
- **Q6 — Link SHA.** Caller lines come from the index built on the default-branch commit
  (`lastIndexedSha`), not the PR head. Link at `ref_sha` and fall back to `head_sha`
  (recommended), or always at `head_sha` as the brief suggests?
- **Q7 — Refresh.** After `POST /repos/:id/resync` completes, should the blast query be
  invalidated? *Default: no. The query refetches on PR revisit.*
  > Superseded by addendum A-14: yes, invalidate on resync completion (the card now has a Resync button).
- **Q8 — Copy.** `blast.stat.crons` is "cron/jobs" but the screenshots show "cron". Should
  `callerCount` become an ICU plural ("1 caller" in 5.png)? Approve the new state strings in step 9.
- **Q9 — PRs never opened in the UI** (MCP path). `pr_files` is filled only by `GET /pulls/:id`, so
  MCP may get `no_changed_files`. Accept that, with a `note` telling the user to open the PR in
  DevDigest (default), or let the blast route fetch files from GitHub (this breaks "pure read")?
- **Q10 — Test location.** Server tests go in `server/test/` (the package's actual convention)
  rather than next to the module, as the root CLAUDE.md wording suggests. Confirm.

**Risks:**
- **The index reflects the base/default branch, not the PR head.** Symbols *added* by the PR are
  not in the index, so they are not listed. Callers in other changed files may have shifted lines.
  This is inherent to "read precomputed data". Document it in the card? (Covered by Q6.)
- **Symbols with the same name in two changed files are merged into one group**, because
  `viaSymbol` is just a name.
- **The 2-column Overview layout** narrows the IntentCard. Check that its inner IN/OUT columns stay
  readable.

**For the architecture-reviewer:**
- `BlastIntel` is a type-only import of `RepoIntel` from `repo-intel/index.ts` inside `ports.ts`.
- No `Container` is injected into `BlastService`.
- The module-local response schema extends the vendored contract.
- `container.blast` is lazy.

**For the security review / plan-verifier:**
- The route is workspace-scoped (404 for a foreign PR).
- Repo-derived strings are rendered as text, and links are built only through `githubBlobUrl`.
- MCP strings are sanitized.
- No secrets, no GitHub/LLM calls in the blast route.
  > Superseded by addendum: the map route has a bounded GitHub fallback and the new history route calls GitHub GraphQL; still no LLM, no writes (A9).
- The vendor, migration and lockfile diff is empty.

## 10. Could not determine

- **Exact `Icon.*` names in `@devdigest/ui`** (`client/src/vendor/ui/icons.tsx`) for the header
  glyph, `<>`, `↳`, globe, clock and chevrons. I listed the file but did not read it (the research
  budget ran out). The implementer must grep `icons.tsx` and pick the closest existing icons.
  - If the 2.png header glyph has no match, use the closest existing icon and say so in the PR. Do
    not edit vendor/ui.
- **Exact spacing, colors and chip tints.** These are estimated from the screenshots. The implementer
  should grep the `design/` HTML for the "Blast radius" tokens. `design/` is untracked in git, so it
  is not a stable reference for reviewers.
- **Whether the client `@devdigest/shared` `BlastRadius` block is byte-identical to the server
  copy.** The brief says it is, but it was not diffed. Step 7 requires the `diff`.
- **How existing client hook-backed component tests mock `fetch` / provide `QueryClient`** (e.g.
  `FindingsSummary.test.tsx`, `RunHistory.test.tsx`). Not read. The implementer should copy the
  nearest one.
- **Whether `MockLLMProvider`/other overrides are needed in `blast.it.test.ts`.** They should not
  be, since the route makes no LLM calls, but `buildApp` boot-time behaviour was not traced.
- **The behaviour of `getIndexState` for `repo_too_large`.** Nothing in the read code emits that
  reason. It is passed through if it ever appears.

---

# Addendum: Prior PRs + remaining brief items (2026-10-02)

Baseline (already implemented, uncommitted, in the main checkout): `server/src/modules/blast/`
(`GET /pulls/:id/blast`, module-local `BlastRadiusResponse` with `degraded`/`reason`/`ref_sha`,
GitHub changed-files fallback bounded by `BLAST_GITHUB_DEADLINE_MS`), client `useBlastRadius`,
`BlastRadiusCard` with Tree (`SymbolTree`) + Graph (`BlastGraph`) + toggle, degraded notice,
loading/error/empty states. **MCP is deferred** (§7 steps 13–15 are parked, not executed).
**Prior PRs is not built.** This addendum is the plan for the remaining brief items; it does not
re-plan what exists.

## A1. Goal & scope

Brief items (translated) and what this addendum does with each:

| # | Brief item | Status | Addendum action |
|---|---|---|---|
| B1 | Symbols collapse/expand as a tree (3.png) | built | **verify only** (A8) |
| B2 | Graph view with Tree/Graph toggle | built | **verify only** (A8); one copy mismatch flagged (QA-7) |
| B3 | "Prior PRs touching these files" block (2.png/3.png collapsed, 7.png expanded) | not built | **build**: steps A-1…A-13 |
| B4 | Crons shown separately from HTTP endpoints | partial | Tree: own row (A-15). Graph: decision in A-16 |
| B5 | Symbols sorted by rank, most important on top | not built | server sort (A-3) |
| B6 | Resync button next to the "index incomplete" notice | not built | A-14 |
| B7 | All UI labels from `blast.json`, none hardcoded | mostly done | audit result in A2; new keys in A-17 |

**Non-goals:**
- MCP (`devdigest_get_blast_radius`) and exposing Prior PRs via MCP.
- LLM-written notes ("Established the router this PR hooks into" in 7.png reads like model output;
  we do not call a model — see A4 / QA-1).
- Persisting history in the DB (no table, no migration).
- Rendering `files_overlap` visually (7.png does not show it; it stays data-only).
- Any edit to `*/vendor/shared/**`, `client/src/vendor/ui/**`, `server/src/modules/repo-intel/**`,
  migrations or lockfiles.
- Fixing the hardcoded `Description` label in `OverviewTab.tsx:25` (pre-existing, outside the
  blast card; mentioned for the record only).

## A2. Context read (addendum)

Files read for this addendum: `server/src/modules/blast/{ports,service,helpers,sources,routes}.ts`,
`server/src/vendor/shared/contracts/brief.ts` (Blast + PR History blocks),
`server/src/vendor/shared/adapters.ts` (`GitHubClient`, grep), `server/src/adapters/github/octokit.ts`,
`server/src/platform/container.ts` (grep), `server/src/platform/resilience.ts` (grep),
`server/src/modules/repo-intel/{types,service,repository}.ts` (grep around rank),
`server/src/db/schema/{pulls,repos}.ts` (grep), `server/INSIGHTS.md` (Codebase Patterns);
`client/.../BlastRadiusCard/{BlastRadiusCard.tsx,helpers.ts}`, `SymbolTree.tsx`, `BlastGraph.tsx`,
`BlastGraph/helpers.ts` (grep), `OverviewTab.tsx`, `page.tsx` (grep), `client/messages/en/blast.json`,
`client/src/lib/{github-urls.ts,hooks/keys.ts,hooks/repo-intel.ts}`,
`client/src/vendor/ui/primitives/Avatar.tsx`, `client/src/vendor/ui/icons.tsx` (grep),
`client/src/vendor/shared/contracts/brief.ts` (grep). Screenshots 3.png and 7.png.

Verified facts:
- **`PrHistory` contract** (`server/src/vendor/shared/contracts/brief.ts:64-78`; the client copy has
  the same `PrHistoryItem` fields at `client/src/vendor/shared/contracts/brief.ts:65-72`):
  `PrHistoryItem = { pr_number: int, title: string, merged_at: string, author: string,
  files_overlap: string[], notes: string }`, `PrHistory = { history: PrHistoryItem[] }`.
  This covers everything 7.png shows:
  - the avatar in 7.png is an initials circle, which is exactly the vendored `Avatar` primitive
    (`client/src/vendor/ui/primitives/Avatar.tsx:3`, initials and hue derived from `name`), so no
    avatar URL is needed;
  - the PR link is built client-side with `githubPrUrl(repoFullName, number)`
    (`client/src/lib/github-urls.ts:16`), so no `url` field is needed.
  So **no extension of the item shape is required**.
- **`GitHubClient` port** (`server/src/vendor/shared/adapters.ts:143-166`) has no
  history/commits-for-path/associated-PRs method. Adding one is a vendor edit (do-not-touch), so
  Prior PRs needs a **module-local port** plus its own adapter. `OctokitGitHubClient`
  (`server/src/adapters/github/octokit.ts:29`) wraps every call in `withRetry(withTimeout(…, 30s))`;
  `octokit` is already a dependency (no lockfile change).
- **`withTimeout(p, ms)`** already exists in `server/src/platform/resilience.ts:13`. server
  INSIGHTS (2026-10-02) says: "`withDeadline` is now duplicated in `intent/sources.ts` and
  `blast/sources.ts`: extract it to a shared helper on the third use." Prior PRs would be the third
  use → reuse `withTimeout` instead of a third copy.
- **`pull_requests.base`** exists (`server/src/db/schema/pulls.ts:19`), but `BlastPull` does not
  carry it (`blast/repository.ts:14-27`, `blast/ports.ts:18-24`).
- **Rank.** The facade sorts callers by `rank` desc (`repo-intel/service.ts:372`) before the global
  slice (`:386`); the ripgrep path sets `rank: 0` (`:283`). `BlastCallerRow.rank` exists
  (`repo-intel/types.ts:70-71`) but is not on the wire. `groupCallers` orders groups by
  changed-symbol order (`blast/helpers.ts:22-24`), so B5 is **not** satisfied today and must be done
  server-side (only the server sees `rank`).
- **Resync.** `useResyncRepoIntel` invalidates `repoIntelState` + `prBlastAll` in `onSuccess`
  (`client/src/lib/hooks/repo-intel.ts:58-66`). The POST returns 202 before reindexing finishes,
  so that immediate refetch returns pre-resync data. The real completion signal is the effect in
  `useRepoIntelStatus` (`:42-52`), which invalidates `prBlastAll` when `lastIndexedSha` changes.
  It only runs where that hook is mounted with polling (today `ProjectContextView`), and it does not
  fire when the resync finishes with an unchanged sha (e.g. `failed` → `full` on the same commit).
- **Card props** do not include `repoId` (`OverviewTab.tsx:9-21`, `page.tsx:140`); `page.tsx:29-32`
  has `repoId` from `useParams`.
- **Degraded notice** is a `role="status"` block (`BlastRadiusCard.tsx:100-105`); there is no
  separate "badge" element. The Resync button goes inside this block.
- **Tree chips (B4).** Endpoint and cron chips share one wrapping container `s.chips`
  (`SymbolTree.tsx:70-85`); crons are only on their own line when the row wraps (3.png happens to
  wrap).
- **Graph chips (B4).** Endpoints and crons both go to the third column (`BlastGraph/helpers.ts:78-79`,
  node kind `"cron"` exists). The legend lists only symbol/callers/endpoints (`BlastGraph.tsx:90`),
  so a cron node is visually unexplained. 4.png/7.png show no crons in the graph at all.
- **Icons.** `Icon.History` exists (`client/src/vendor/ui/icons.tsx:10,92`), matching the 7.png
  header glyph. A grep for `ChevronUp` found nothing, so the expanded chevron is
  `Icon.ChevronDown` rotated 180° (or whatever the grep in step A-10 finds).
- **i18n audit (B7).** `BlastRadiusCard.tsx`, `SymbolTree.tsx` and `BlastGraph.tsx`: every
  user-visible label goes through `t()`. The only literals are data formatting, not labels: the `()`
  suffix (`helpers.ts:24`), `—` in the graph node `<title>` (`BlastGraph/helpers.ts:102`) and the `…`
  truncation (`:52`). Gaps: no legend key for crons (needed by A-16); `blast.view.tree/graph` are
  lowercase (`"tree"`, `"graph"`) while 3.png/7.png show "Tree" / "Graph" (QA-7). `styles.ts` and
  `constants.ts` were not read (A10).

INSIGHTS entries that bear on the addendum (quoted):
- `server/INSIGHTS.md`, Codebase Patterns 2026-10-02: "`withDeadline` is now duplicated in
  `intent/sources.ts` and `blast/sources.ts`: extract it to a shared helper on the third use."
- `server/INSIGHTS.md`, Recurring Errors 2026-09-24: "`*.it.test.ts` suites build
  `loadConfig(process.env)`, so `LocalSecretsProvider` reads the developer's REAL
  `~/.devdigest/secrets.json`." The history route calls GitHub, so the `.it` test **must** inject
  the history source through `ContainerOverrides`; otherwise a developer with a real
  `GITHUB_TOKEN` hits github.com from the test.
- `client/INSIGHTS.md`, Tool & Library Notes 2026-09-20: "`@testing-library/user-event` is NOT a
  client dependency … component tests use the `fireEvent`-based shim `src/test/user.ts`."

## A3. Affected modules (addendum)

**server/**

| File | Status | Change |
|---|---|---|
| `src/modules/blast/ports.ts` | MODIFIED | `BlastPull` gains `base: string`. New: `PriorPrQuery`, `PriorPrHit`, `PriorPrSource`, `PriorPrsView`, `BlastHistoryReader` (A4). |
| `src/modules/blast/constants.ts` | MODIFIED | `HISTORY_MAX_FILES = 20`, `HISTORY_COMMITS_PER_FILE = 10`, `HISTORY_PRS_PER_COMMIT = 3`, `HISTORY_MAX_ITEMS = 5`, `HISTORY_NOTE_MAX = 160`, `HISTORY_CACHE_TTL_MS = 10 * 60_000`, `HISTORY_CACHE_MAX = 200`, `BLAST_HISTORY_DEADLINE_MS = 8_000`. |
| `src/modules/blast/helpers.ts` | MODIFIED | `groupCallers` orders groups by rank (A-3). |
| `src/modules/blast/history.ts` | NEW | Pure helpers: `noteFromBody`, `toPriorPrs`. No I/O. |
| `src/modules/blast/repository.ts` | MODIFIED | `getPull` also selects `t.pullRequests.base`. |
| `src/modules/blast/schemas.ts` | MODIFIED | `PriorPrsResponse = PrHistory.extend({ available: z.boolean() })`. |
| `src/modules/blast/service.ts` | MODIFIED | `BlastService` also implements `BlastHistoryReader.history()`, plus an in-memory TTL cache. |
| `src/modules/blast/routes.ts` | MODIFIED | `GET /pulls/:id/blast/history`; the header comment is updated. |
| `src/modules/blast/sources.ts` | MODIFIED | Drop the local `withDeadline` and use `withTimeout` from `platform/resilience.js`. |
| `src/adapters/github/pr-history.ts` | NEW | `OctokitPriorPrSource implements PriorPrSource` (GraphQL; SDK stays here). |
| `src/adapters/mocks.ts` | MODIFIED | `MockPriorPrSource` (deterministic hits). |
| `src/platform/container.ts` | MODIFIED | `ContainerOverrides.priorPrs?`, `async priorPrSource()`, `_priorPrs` cleared in `invalidateSecretCaches`, new `history` dep on `BlastService`, and the container's `blast` type becomes `BlastReader & BlastHistoryReader`. |
| `test/blast-helpers.test.ts` | MODIFIED | Rank-order cases. |
| `test/blast-history.test.ts` | NEW | `noteFromBody`, `toPriorPrs`. |
| `test/blast-service.test.ts` | MODIFIED | `history()` cases. |
| `test/blast-pr-history-source.test.ts` | NEW | Adapter with an injected fake `graphql` function. |
| `test/blast.it.test.ts` | MODIFIED | History route cases. |

**client/**

| File | Status | Change |
|---|---|---|
| `src/lib/hooks/keys.ts` | MODIFIED | `prBlastHistory: (prId) => ["pr-blast-history", prId] as const`. This is deliberately **not** under the `"pr-blast"` prefix, so `prBlastAll` invalidation after a resync does not refetch GitHub. |
| `src/lib/hooks/blast.ts` | MODIFIED | `usePriorPrs(prId)` + the `PriorPrsResponse` type. |
| `src/lib/hooks/repo-intel.ts` | MODIFIED | `useResyncAndRefresh(repoId)` (A-14). |
| `page.tsx`, `OverviewTab/OverviewTab.tsx` | MODIFIED | Pass `repoId` down to `BlastRadiusCard`. |
| `BlastRadiusCard/BlastRadiusCard.tsx` | MODIFIED | `repoId` prop, `<ResyncButton>` inside the degraded notice, `<PriorPrs>` at the bottom of the card (both views). |
| `BlastRadiusCard/constants.ts` | MODIFIED | `RESYNCABLE_REASONS`. |
| `BlastRadiusCard/styles.ts` | MODIFIED | Two chip rows; divider above Prior PRs. |
| `BlastRadiusCard/_components/PriorPrs/{PriorPrs.tsx,helpers.ts,styles.ts,index.ts,PriorPrs.test.tsx,helpers.test.ts}` | NEW | The block from 3.png/7.png. |
| `BlastRadiusCard/_components/ResyncButton/{ResyncButton.tsx,index.ts,ResyncButton.test.tsx}` | NEW | The button and its pending state. |
| `BlastRadiusCard/_components/SymbolTree/SymbolTree.tsx` | MODIFIED | Endpoint row, then a separate cron row. |
| `BlastRadiusCard/_components/BlastGraph/{helpers.ts,BlastGraph.tsx,helpers.test.ts}` | MODIFIED | Cron block placement + legend (A-16). |
| `BlastRadiusCard/BlastRadiusCard.test.tsx` | MODIFIED | Cases for resync visibility and Prior PRs presence. |
| `messages/en/blast.json` | MODIFIED | New keys only (A-17). |

**mcp/**: none (deferred).

## A4. Contracts touched (addendum)

- **Vendored `PrHistory` / `PrHistoryItem`: read-only, used as-is.** No sync-source change is
  needed. If a later design wants `url` or `avatar_url`, add them via a module-local `.extend`, not
  in vendor.
- **Module-local response** (`server/src/modules/blast/schemas.ts`):
  ```ts
  export const PriorPrsResponse = PrHistory.extend({
    /** false = GitHub could not be consulted (no token, offline, rate limit, deadline). */
    available: z.boolean(),
  });
  ```
  Field semantics, fixed by this plan:
  - `merged_at`: ISO 8601 from GitHub `mergedAt`.
  - `author`: GitHub login, or `'unknown'` when the author is null (same fallback as
    `octokit.ts:53`).
  - `files_overlap`: the subset of this PR's changed paths that the prior PR touched, sorted.
  - `notes`: one-line plain-text excerpt (QA-1), or `''` when none.
- **Server-local types** (`ports.ts`, plain TS):
  ```ts
  export interface PriorPrQuery { repo: { owner: string; name: string }; ref: string; paths: string[] }
  export interface PriorPrHit { number: number; title: string; mergedAt: string | null; author: string; body: string; path: string }
  /** May throw (no token, network, deadline). The service turns any failure into `available:false`. */
  export interface PriorPrSource { listForPaths(q: PriorPrQuery): Promise<PriorPrHit[]> }
  export type PriorPrsView = PrHistory & { available: boolean };
  export interface BlastHistoryReader { history(workspaceId: string, prId: string): Promise<PriorPrsView> }
  ```
- **New API: `GET /pulls/:id/blast/history`.**
  - `params: IdParams`; `response: { 200: PriorPrsResponse }`.
  - 404 for a PR outside the workspace; 422 for a non-uuid id.
  - **Never 5xx because of GitHub.** It returns `{ history: [], available: false }` instead.
- **`GET /pulls/:id/blast`:** the shape is unchanged; only `downstream` order changes (A-3).
- **Client type** (`hooks/blast.ts`): `type PriorPrsResponse = PrHistory & { available: boolean }`,
  where `PrHistory` is a type import from the client's vendored `@devdigest/shared`.
- **DB / migrations:** none.

**Decision — separate route vs. extending `GET /pulls/:id/blast`: separate route
(recommended).**
- The map is a local DB/index read (milliseconds). History is a network call of up to 8 s.
  Bundling them would make the whole card wait on GitHub.
- Failure isolation: a GitHub outage must not touch the map.
- Independent caching: resync invalidates the map (`prBlastAll`) but must not re-hit GitHub; a
  different query key gives that for free.
- The map contract stays the same for a future MCP tool.
- Rejected: extending the blast response with `history` (couples latency and cache lifetimes), and
  firing the history fetch only on expand (7.png/3.png show the count badge "3" while collapsed, so
  the data is needed at mount).

**Decision — how to fetch prior PRs: one GitHub GraphQL request (recommended).**
- The query goes against `repository.object(expression: $ref)` on a `Commit`, with one aliased
  `history(path: $pN, first: HISTORY_COMMITS_PER_FILE)` per changed file (capped at
  `HISTORY_MAX_FILES`).
- Each history node asks for
  `associatedPullRequests(first: HISTORY_PRS_PER_COMMIT) { nodes { number title mergedAt bodyText author { login } } }`.
- That is **one HTTP call** for all files. By the documented formula the cost is a few points of
  the 5,000/h GraphQL budget (estimate unverified, A10).
- `$ref` = the PR's `base` branch. If `object` is null (branch deleted/renamed), retry once with
  `"HEAD"` (the default branch).
- Rejected alternatives:
  - REST `GET /commits?path=` per file plus `GET /commits/{sha}/pulls` per commit: up to ~20 +
    200 calls, which does not fit an 8 s deadline or the rate limit.
  - The search API: it cannot filter PRs by file path.
  - Local `git log` on the clone: no GitHub cost, but PR number/title come only from squash
    subjects `(#123)`, there is no author login and no body, and the user explicitly asked for
    GitHub.
  - Adding a method to the vendored `GitHubClient`: do-not-touch.
- Selection rules (pure helper `toPriorPrs`):
  1. drop hits with `mergedAt == null`;
  2. drop `number === current PR number`;
  3. merge hits by `number` (union of `path` → `files_overlap`);
  4. sort by `files_overlap.length` desc, then `merged_at` desc, then `number` desc;
  5. take `HISTORY_MAX_ITEMS` (5).

**Decision — `notes` without an LLM.** `noteFromBody(bodyText)`:
1. Take the first line of the PR body that is meaningful after trimming. Skip empty lines and
   lines starting with `#`, `<!--`, `>`, `- [`, `|` or a code fence.
2. Collapse whitespace and strip control characters.
3. Truncate to `HISTORY_NOTE_MAX` with `…`.
4. Return `''` when nothing qualifies; the UI then omits the note line.

`bodyText` is GitHub's markdown-stripped text, so no markdown parser is needed. The note is plain
text, so 7.png's inline-code/bold styling inside notes is **not** reproduced (QA-1).

## A5. Skills for implementer (addendum)

| Skill | Governs | Key rules for this task |
|---|---|---|
| onion-architecture | A-1…A-8 | The port lives in `blast/ports.ts`; the GraphQL adapter lives in `src/adapters/github/pr-history.ts` (Octokit types never leave it); `MockPriorPrSource` goes in `mocks.ts`; the service receives `history: () => Promise<PriorPrSource>` (narrow port factory, like `github: () => this.github()`), never `Container`. `service.ts`/`history.ts` import no octokit/zod/fastify. |
| fastify-best-practices | A-7 | The route only parses `IdParams`, calls `container.blast.history(...)` and returns. The response schema goes through `fastify-type-provider-zod`. No try/catch in the route; the service already never throws for GitHub failures. |
| zod | A-6, A-5 | `PrHistory.extend({ available })`. In the adapter, validate the GraphQL payload with a local Zod schema (`safeParse`; malformed → throw so the service maps it to `available:false`). |
| drizzle-orm-patterns | A-2 | Add only `base: t.pullRequests.base` to the existing select; explicit columns; mapped return. |
| react-frontend-architecture | A-9…A-16 | `PriorPrs/` and `ResyncButton/` are PascalCase folders under `BlastRadiusCard/_components/` with lowercase siblings and an `index.ts` that re-exports only the component. Data hooks live in `src/lib/hooks/*.ts`; components never `fetch`. Strings live in `blast.json`. |
| react-best-practices | A-10, A-14 | Collapsed/expanded is local `useState`. Derive the date string and the visibility flags during render. The only Effect-like logic (resync completion) lives in the data-layer hook, not in the component. |
| react-testing-library | A-12, A-13 | Flow tests by role/text; the `src/test/user.ts` shim; mock `fetch` at the API boundary. |
| design | A-10, A-15, A-16 | Use 3.png (collapsed row) and 7.png (expanded timeline) as the source of truth. Do not add an empty-state row, a files-overlap list or a skeleton for Prior PRs (none appears in the screenshots). |
| security | A-6, A-10 | PR titles, notes and author logins are untrusted → React text only, never `dangerouslySetInnerHTML`, never markdown-rendered. The GraphQL query string is built **only from numeric indices**; file paths and ref go in **variables**, never interpolated. Links go only via `githubPrUrl` with `target="_blank" rel="noopener noreferrer"`. The token comes only from `SecretsProvider`. |
| typescript-expert | A-1, A-9 | Type-only imports; no `any` (type the GraphQL response via the Zod infer). |

Not applicable: postgresql-table-design (no schema change), next-best-practices (no new route/RSC
boundary).

## A6. Architecture constraints (addendum)

- The **GraphQL adapter** lives in `server/src/adapters/github/pr-history.ts`.
  - It type-imports `PriorPrSource`/`PriorPrQuery`/`PriorPrHit` from `../../modules/blast/ports.js`.
    Infrastructure implementing an application port is allowed by the dependency rule; flagged for
    the architecture-reviewer.
  - Constructor: `new OctokitPriorPrSource(gql: GraphqlFn)` with
    `type GraphqlFn = (query: string, vars: Record<string, unknown>) => Promise<unknown>`, plus
    `static fromToken(token)` that builds `new Octokit({ auth: token }).graphql`. Tests inject a
    fake `gql`.
  - Wrap the call in `withTimeout(…, BLAST_HISTORY_DEADLINE_MS)`. **No `withRetry`**: retries do
    not fit the deadline.
- **Container.**
  - `async priorPrSource(): Promise<PriorPrSource>` mirrors `github()` (`container.ts:227-234`):
    `overrides.priorPrs` → cached `_priorPrs` → `GITHUB_TOKEN` from `this.secrets`, or throw
    `ConfigError`.
  - `invalidateSecretCaches()` also clears `_priorPrs` (`container.ts:288-292`).
  - `BlastService` deps gain `history: () => this.priorPrSource()`.
- **The map route must never call the history source**, and the history route must never call
  repo-intel. They share only `BlastPullReader` + `BlastRemoteFiles`.
- **Cache.**
  - A per-service-instance `Map` (not a module-level singleton; the container owns the single
    service instance).
  - Key `${prId}:${headSha}`, TTL `HISTORY_CACHE_TTL_MS`, evict oldest beyond `HISTORY_CACHE_MAX`.
  - Cache **only** `available: true` results, so a token added later takes effect immediately.
  - Inject `now: () => number` (default `Date.now`) for tests.
- Server tests stay in `server/test/` (package convention, §6).
- Do-not-touch is unchanged (§6 list). In particular, `PrHistory` is consumed, not edited.

## A7. Steps (addendum)

**Server**

- **A-1 `blast/ports.ts`** (onion-architecture, typescript-expert)
  - Add `base: string` to `BlastPull`.
  - Add `PriorPrQuery`, `PriorPrHit`, `PriorPrSource`, `PriorPrsView`, `BlastHistoryReader`
    exactly as in A4. Type-import `PrHistory` from `@devdigest/shared`.
- **A-2 `blast/repository.ts`** (drizzle-orm-patterns)
  - `getPull` selects `base: t.pullRequests.base` and maps it.
  - Update the fake `BlastPullReader` fixtures in existing tests.
- **A-3 `blast/helpers.ts` — rank order (B5)** (onion-architecture)
  - In `groupCallers`, keep each caller's `rank` while grouping (internal only, not emitted).
  - Sort callers inside a group by `rank` desc with a stable sort. The facade already does this;
    sort explicitly so the order does not depend on facade internals.
  - Order groups by:
    1. max caller `rank` desc,
    2. then `callers.length` desc,
    3. then changed-symbol order (the old rule) as the final tie-break.
  - In the ripgrep path all ranks are 0, so caller count decides.
  - Update the doc comment.
  - Effects: `DEFAULT_EXPANDED_GROUPS = 1` now opens the most important symbol; the Graph's
    default pick (`downstream[0]`) follows too. No client sort is added; the server owns the order.
- **A-4 `blast/history.ts` (NEW, pure)** (onion-architecture)
  - `noteFromBody(body: string): string`, per A4.
  - `toPriorPrs(hits, { currentNumber, changedPaths, limit }): PrHistoryItem[]`, per the A4
    selection rules.
    - `files_overlap` = the sorted union of hit `path`s intersected with `changedPaths`.
    - `notes` = `noteFromBody` of the first hit's body.
- **A-5 `blast/sources.ts`** — replace the local `withDeadline` with `withTimeout` from
  `../../platform/resilience.js` (resolves the INSIGHTS "third use" note). Behaviour is unchanged.
- **A-6 `src/adapters/github/pr-history.ts` (NEW) + `mocks.ts`** (onion-architecture, zod,
  security)
  - Build the query from indices only:
    `query($owner:String!,$name:String!,$ref:String!,$p0:String!,…){ repository(owner:$owner,name:$name){ object(expression:$ref){ ... on Commit { f0: history(path:$p0, first:N){ nodes { associatedPullRequests(first:M){ nodes { number title mergedAt bodyText author { login } } } } } … } } } }`.
  - Variables: `owner`, `name`, `ref`, `p0..pK`.
  - Validate the result with a local Zod schema. Map alias `fI` → `PriorPrHit` with
    `path = paths[I]`.
  - If `repository.object` is null and `ref !== 'HEAD'`, retry once with `ref: 'HEAD'`.
  - Wrap the whole call in `withTimeout(…, BLAST_HISTORY_DEADLINE_MS)`. Let errors propagate.
  - In `mocks.ts`, add `MockPriorPrSource implements PriorPrSource` returning 3 fixed merged hits
    plus one unmerged hit and one hit equal to the current PR number (exercises the filters).
- **A-7 `blast/schemas.ts`, `service.ts`, `routes.ts`** (zod, onion-architecture,
  fastify-best-practices)
  - `schemas.ts`: add `PriorPrsResponse` (A4).
  - `BlastDeps` gains `history: () => Promise<PriorPrSource>` and optional `now?: () => number`.
    `BlastService` implements `BlastReader & BlastHistoryReader`.
  - `history(workspaceId, prId)`:
    1. `pull = getPull(...)`. If missing → `NotFoundError('Pull request not found')`.
    2. On a cache hit (fresh), return it.
    3. `paths = listChangedPaths` → fallback `remoteFiles.listChangedPaths(pull)`. If empty →
       `{ history: [], available: false }`, not cached.
    4. `try { source = await history(); hits = await source.listForPaths({ repo: pull.repo, ref:
       pull.base, paths: paths.slice(0, HISTORY_MAX_FILES) }) } catch { return { history: [],
       available: false } }`.
    5. `view = { history: toPriorPrs(hits, { currentNumber: pull.number, changedPaths: paths,
       limit: HISTORY_MAX_ITEMS }), available: true }`. Cache it and return it.
  - Worst case is two sequential GitHub calls (the file fallback, then history), about 16 s. This
    is accepted because the fallback only runs for PRs never opened in the UI (A9).
  - `routes.ts`: add `app.get('/pulls/:id/blast/history', { schema: { params: IdParams, response:
    { 200: PriorPrsResponse } } }, …)` → `container.blast.history(workspaceId, req.params.id)`.
  - Update the header comment: "history: GitHub GraphQL, bounded, cached; never errors on GitHub
    failure; no LLM, no writes".
- **A-8 `platform/container.ts`** (onion-architecture)
  - Make the A6 changes.
  - Type `get blast()` as `BlastReader & BlastHistoryReader`.
- **A-11 Server tests**
  - `test/blast-helpers.test.ts` (extend), rank order:
    - a later changed symbol with a higher-rank caller is listed first;
    - with equal rank, more callers come first;
    - with a full tie, changed-symbol order is kept;
    - all-zero ranks (ripgrep) → ordered by count;
    - callers inside a group are sorted by rank desc.
  - `test/blast-history.test.ts` (NEW):
    - `noteFromBody`: headings, comments and checklists are skipped; truncation with `…`; `''`
      for an empty or template-only body.
    - `toPriorPrs`: unmerged dropped, current PR dropped, merge by number with the
      `files_overlap` union, order (overlap → date → number), cap at 5.
  - `test/blast-service.test.ts` (extend):
    - history 404;
    - no paths → `available:false` and the source is never constructed (spy);
    - the source factory throws (`ConfigError`) → `available:false`;
    - `listForPaths` rejects → `available:false`;
    - success is cached: the second call with the same `headSha` within the TTL calls the source
      once; after `now` passes the TTL it calls again; an `available:false` result is not cached;
    - `get()` never calls `history` (spy).
  - `test/blast-pr-history-source.test.ts` (NEW): with a fake `gql`:
    - the query string contains no path text, and the paths appear only in `vars`;
    - aliases map back to the correct `path`;
    - a null `object` triggers one retry with `HEAD`;
    - a malformed payload throws;
    - the deadline rejects (fake timers).
  - `test/blast.it.test.ts` (extend; **must** pass `overrides: { priorPrs: new MockPriorPrSource() }`
    per the 2026-09-24 INSIGHTS):
    - `GET /pulls/:id/blast/history` → 200 with 3 items in the expected order (filters applied);
    - a foreign or unknown uuid → 404; a non-uuid → 422;
    - an override whose `listForPaths` rejects → 200 `{ history: [], available: false }`.

**Client**

- **A-9 `src/lib/hooks/keys.ts` + `hooks/blast.ts`** (react-frontend-architecture)
  - Add `prBlastHistory: (prId) => ["pr-blast-history", prId] as const`, with a comment saying it
    is intentionally outside the `pr-blast` prefix.
  - `usePriorPrs(prId)`:
    `useQuery({ queryKey: queryKeys.prBlastHistory(prId), queryFn: () => api.get<PriorPrsResponse>(`/pulls/${prId}/blast/history`), enabled: !!prId, staleTime: 10 * 60_000, retry: false })`.
  - Export the `PriorPrsResponse` type.
- **A-10 `BlastRadiusCard/_components/PriorPrs/` (NEW)** (react-frontend-architecture, design,
  security)
  - `PriorPrs({ prId, repoFullName })` calls `usePriorPrs(prId)`.
  - **Renders nothing** while loading, on error, when `available === false`, or when
    `history.length === 0` (QA-2). 3.png/7.png show no loading/empty variants, and the block is a
    nice-to-have that must never look broken.
  - **Collapsed (default, 3.png):**
    - a full-width `<button aria-expanded={open}>` row inside a bordered rounded box: `Icon.History`
      (muted), the bold title `blast.history.title`, a muted pill with `history.length`, and a
      right-aligned chevron (down when collapsed, up/rotated when expanded);
    - a divider line above the box, separating it from the tree/graph (3.png).
  - **Expanded (7.png):**
    - an `<ol>` with a vertical timeline line on the left and a small dot per item;
    - row 1: `#<n>` as `<a href={githubPrUrl(repoFullName, n)} target="_blank" rel="noopener
      noreferrer">` in blue mono, then the title in bold (plain text). If `repoFullName` is null,
      `#<n>` is plain text;
    - row 2: `<Avatar name={author} size={14} />` plus muted `t("history.byline", { author, date })`,
      where `date = merged_at.slice(0, 10)` (pure helper `shortDate` in `helpers.ts`, unit-tested);
    - row 3: muted `notes`, only when non-empty;
    - items are separated by a hairline, as in 7.png.
  - Every PR-derived string is React text only. No markdown rendering.
  - Placement: `BlastRadiusCard.tsx` renders `<PriorPrs prId repoFullName />` as the **last child of
    the card, in both views and regardless of map state** (history does not depend on the index).
- **A-12 `PriorPrs.test.tsx` + `helpers.test.ts`** (react-testing-library)
  1. **Collapsed by default.** The title and the count "3" are visible, and no item titles are
     visible.
  2. **Expand** (click via the shim). Each item shows `#401` with
     `href === githubPrUrl(repo, 401)` and `target="_blank"`, the title, the byline
     "deepak.r · 2026-03-18", and the note. An item with `notes: ''` has no note element.
  3. **Hidden** for `available:false`, for an empty `history`, and on a fetch 500.
  4. **Untrusted text.** A title `"<img src=x onerror=alert(1)>"` renders literally (no `img`
     element in the DOM).
  - `helpers.test.ts`: `shortDate`.
- **A-13 `BlastRadiusCard.test.tsx` (extend)**
  - The Prior PRs block renders under both the Tree and the Graph view.
  - It also renders when the map is degraded and empty.
- **A-14 Resync button (B6)** (react-frontend-architecture, react-best-practices)
  - `hooks/repo-intel.ts`: add `useResyncAndRefresh(repoId)`, which returns
    `{ start(): void; pending: boolean; isError: boolean }`.
    - `start()` remembers `since = currentState?.updatedAt ?? ''` and the start time, then calls
      `useResyncRepoIntel(repoId).mutate()`.
    - While pending, it mounts `useRepoIntelStatus(repoId, /*poll*/ true)`.
    - Completion is when `state.updatedAt !== since`, or after a 120 s cap (`RESYNC_POLL_MAX_MS`
      in the hooks file). On completion it invalidates `queryKeys.prBlastAll()`, then clears
      pending. This covers the same-sha case that the existing `lastIndexedSha` effect misses.
    - It never touches `prBlastHistory`.
  - Keep the existing `useResyncRepoIntel` `onSuccess` invalidation unchanged; it is harmless.
  - `BlastRadiusCard/_components/ResyncButton/` (NEW):
    `<Button size="sm" kind="secondary" disabled={pending}>`, labelled `blast.degraded.resync`, or
    `blast.degraded.resyncing` while pending. On mutation error, show a muted `role="alert"`
    `blast.degraded.resyncFailed`.
  - `BlastRadiusCard.tsx`: new `repoId: string | null | undefined` prop. Inside the degraded
    `role="status"` block, put the title and the button on one line (title left, button right),
    shown only when `repoId && RESYNCABLE_REASONS.has(data.reason)`.
  - `constants.ts`: `RESYNCABLE_REASONS = new Set(['no_data', 'index_failed', 'index_partial'])`.
    It is hidden for `flag_off` (resync cannot help while the flag is off), `repo_too_large` and
    `no_changed_files` (QA-6).
  - `page.tsx:140` → pass `repoId={repoId}`. `OverviewTab` passes it through.
  - Tests:
    - `ResyncButton.test.tsx`: a click POSTs `/repos/<id>/resync` (assert the mocked `fetch` URL
      and method); the button is disabled with the "Resyncing…" label while pending; an error
      shows the alert.
    - `BlastRadiusCard.test.tsx`: the button is present for `no_data` and absent for `flag_off`.
- **A-15 Tree: crons in their own row (B4)** (design)
  - `SymbolTree.tsx`: replace the single `s.chips` container with two sibling containers: the
    endpoint chips row (only if non-empty), then the cron chips row (only if non-empty). Each is
    `role="list"` with `aria-label={t("chips.endpoints")}` / `t("chips.crons")` and `role="listitem"`
    chips.
  - Chip styling is unchanged (blue/amber). The result matches 3.png, where the cron chip sits
    under the endpoint chips.
  - Test (in `BlastRadiusCard.test.tsx`): the cron chip is inside the `chips.crons` list and not
    inside the endpoints list.
- **A-16 Graph: crons separated (B4)** (design) — *default pending QA-5.*
  - Keep the three columns of 4.png/7.png.
  - In `BlastGraph/helpers.ts`, lay out the third column as the endpoint nodes, then a vertical gap
    of half a node height, then the cron nodes (kind `"cron"`, amber; confirm `s.rect("cron")` is
    amber in `BlastGraph/styles.ts`, otherwise add the amber tint already used by the tree chip).
  - Add a fourth legend item `blast.graph.legend.crons`, rendered **only when the selected group
    has crons**, so graphs without crons look exactly like 7.png.
  - `helpers.test.ts`: when crons exist, every cron node's `y` is greater than every endpoint
    node's `y + h`; cron node kind is `"cron"`.
- **A-17 `messages/en/blast.json`** (design). Add only these keys and keep every existing key
  unchanged (QA-6/QA-7 may adjust the copy):
  ```json
  "chips": { "endpoints": "Endpoints affected", "crons": "Crons affected" },
  "graph": { "legend": { "crons": "crons affected" } },
  "degraded": { "resync": "Resync index", "resyncing": "Resyncing…", "resyncFailed": "Couldn't start a resync." },
  "history": {
    "title": "Prior PRs touching these files",
    "byline": "{author} · {date}",
    "listLabel": "Prior pull requests"
  }
  ```
  These are merges into the existing `graph`/`degraded` objects, not replacements. The count pill
  shows the bare number, so it needs no key.
  - B7 audit for the implementer: after the changes, run
    `grep -nE '>[^<{}]*[A-Za-z]{3,}[^<{}]*<|aria-label="[^{]|title="[^{]' -r client/src/app/repos/\[repoId\]/pulls/\[number\]/_components/BlastRadiusCard`.
    It should return no user-facing literals.

## A8. Acceptance checks (addendum)

```sh
cd server && npx --yes pnpm@10 typecheck && npx --yes pnpm@10 test
cd client && npx --yes pnpm@10 typecheck && npx --yes pnpm@10 test && npx --yes pnpm@10 lint
git diff --stat -- server/src/vendor client/src/vendor server/src/db/migrations '*/pnpm-lock.yaml'   # expect empty
diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts       # expect no diff
grep -n "withDeadline" -r server/src                                                              # expect no matches
```

API (running stack; do not kill unfamiliar dev servers):

```sh
curl -s localhost:3001/pulls/<pr-uuid>/blast/history | jq '{available, n: (.history|length), first: .history[0]}'
curl -s -o /dev/null -w '%{http_code}\n' localhost:3001/pulls/00000000-0000-4000-8000-000000000000/blast/history   # 404
curl -s localhost:3001/pulls/<pr-uuid>/blast | jq '[.downstream[] | {symbol, n: (.callers|length)}]'   # most important first
```

Browser (land on `/` first, then click into the PR; compare with 3.png and 7.png):
1. **B1 (verify):** the first (now highest-ranked) symbol is expanded and the rest collapsed;
   chevrons toggle and `aria-expanded` flips.
2. **B2 (verify):** the Tree/Graph toggle switches views; with >1 symbol, the symbol picker
   appears; the graph matches 4.png/7.png. Check the toggle label case against 3.png ("Tree" /
   "Graph"), QA-7.
3. **B3:** the "Prior PRs touching these files [N]" row sits at the card bottom, collapsed, in both
   views. Expanding it shows the 7.png timeline, and `#n` opens github.com `/pull/n` in a new tab.
   With no `GITHUB_TOKEN` (or offline) the row is absent and the map still renders.
4. **B4:** in the Tree, cron chips sit on their own row under the endpoint chips. In the Graph,
   crons sit below the endpoints, amber, with a legend item only when present.
5. **B5:** the symbol order matches the `curl` order above.
6. **B6:** on an unindexed repo, the degraded notice shows a "Resync index" button. Clicking it
   shows "Resyncing…", and after the index state's `updatedAt` advances, the map refetches by
   itself (Network tab: `GET /pulls/:id/blast` and no `/blast/history` refetch). With
   `REPO_INTEL_ENABLED=false` there is no button.
7. **B7:** every label in the card comes from `blast.json`/`brief.json` (the grep in A-17 returns
   nothing user-facing).
8. Take screenshots of the collapsed and expanded Prior PRs block and put them next to 3.png/7.png
   in the PR.

## A9. Risks & open questions (addendum)

Risks:
- **Fine-grained PAT + GraphQL.** If the user's token cannot call GraphQL `history`/
  `associatedPullRequests`, the block silently stays hidden (`available:false`). This is never an
  error, but it can look like "feature missing". Check with `curl` (A8) during the browser check.
- **Squash vs. merge commits.** `associatedPullRequests` on a commit returns the PR that contains
  it. For rebased/merged histories, older PRs may surface under many commits; merge-by-number dedupes
  them.
- **Notes quality.** A body's first line is often template text ("## Summary" is skipped, but
  "This PR…" is kept). It is never as good as 7.png's curated notes (QA-1).
- **Latency stack-up** of about 16 s worst case for PRs with no persisted files (the changed-files
  fallback, then history). This only affects the history request, never the map.
- **Rank sort changes the default-expanded symbol.** Existing client tests that assume
  changed-symbol order must use fixtures whose server order is explicit (the client never sorts).

For the architecture-reviewer:
- `src/adapters/github/pr-history.ts` type-imports ports from `modules/blast/ports.ts`
  (infrastructure → application).
- `BlastService` now has two read methods behind two interfaces; the container exposes the
  intersection type.
- The cache is a service-instance field, not a module singleton.
- `withDeadline` is removed in favour of `platform/resilience.withTimeout`.

For the security review:
- The GraphQL query text contains no user/repo data (indices only); paths and ref are variables.
- PR title/body/login are untrusted → text only, `bodyText` truncated and control characters
  stripped.
- `#n` links come only from `githubPrUrl` (numeric `n`, `repoFullName` from our DB) with `rel`
  set.
- The token is read via `SecretsProvider` only and never logged.
- Both routes are workspace-scoped through `getContext` (404 for a foreign PR).

**Open questions for the user** (defaults are applied if unanswered; nothing is hard-blocked):
- **QA-1 — Note source.** Use the PR body's first meaningful line, plain text, ≤160 chars
  (*default*), or omit notes entirely? An LLM-written note like 7.png's is out of scope.
- **QA-2 — Empty/unavailable.** Hide the whole Prior PRs row when there are no prior PRs or
  GitHub is unavailable (*default*, no added visuals), or show "No prior PRs found" / "GitHub
  unavailable" text?
- **QA-3 — Caps.** Up to 5 PRs, from the first 20 changed files, 10 commits per file (*default*)?
- **QA-4 — Bots.** Exclude bot authors (`dependabot[bot]`, `renovate[bot]`, any `*[bot]`) from
  Prior PRs? *Default: no filter.*
- **QA-5 — Crons in the Graph.** Same third column below the endpoints, amber, with a conditional
  legend item (*default*); a fourth column; or omit crons from the graph (4.png/7.png show none)?
- **QA-6 — Resync button.** Is the copy "Resync index" / "Resyncing…" OK? Should it show only for
  `no_data`, `index_failed` and `index_partial` (*default*)?
- **QA-7 — Toggle label case.** `blast.view.tree/graph` are `"tree"`/`"graph"`, but 3.png/7.png
  show "Tree"/"Graph". If the rendered text is lowercase (no CSS capitalize in `styles.ts`), may
  the existing key values change to "Tree"/"Graph"? Changing existing copy needs your OK.
- **QA-8 — Prior PR ordering.** Most overlapping files first, then most recent (*default*), or
  purely most recent (7.png's three items happen to be date-desc)?
- **QA-9 — MCP.** Confirm MCP stays deferred, including Prior PRs (§7 steps 13–15 parked).

## A10. Could not determine (addendum)

- **GraphQL cost and fine-grained-PAT support** for `Commit.history(path:)` +
  `associatedPullRequests`. Not verified against the live API; no request was made. The 5,000/h
  budget estimate is from the documented cost formula, not measured.
- **`BlastGraph/styles.ts` `rect("cron")` colour**, and whether `BlastRadiusCard/styles.ts`
  capitalizes the toggle labels. Not read. The implementer checks both (A-16, QA-7).
- **`POST /repos/:id/resync` behaviour when `REPO_INTEL_ENABLED=false`** (error vs no-op). Not
  traced; the button is hidden for `flag_off` regardless.
- **`getIndexState().updatedAt` for a never-indexed repo** (synthetic row: empty string, epoch or
  now?). The completion rule "`updatedAt` changed" assumes the first real index row has a
  different value. The 120 s cap is the safety net.
- **Exact spacing/colours of the Prior PRs block** (pill, dot, timeline line). Estimated from
  3.png/7.png only. Grep `design/` for "Prior PRs" before guessing.
- **Skill files** (zod, security, react-best-practices, react-testing-library, design,
  typescript-expert) were not re-read for this addendum (efficiency constraint). The rules cited in
  A5 come from the original plan's reading and the onion/frontend skills supplied in this session.
