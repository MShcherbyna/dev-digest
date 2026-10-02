# Development Plan: Smart Diff (role-grouped "Files changed" tab with inline findings)

## 1. Goal & scope

**Goal.** On the PR detail page's "Files changed" tab, show changed files grouped by
role in this order: **core → tests → wiring → docs → boilerplate**. Each group has
a header with the role label, a one-line description, the file count, and (after a
review has run) a red dot plus the number of *files* in that group that have at
least one finding. Collapsible group sections start collapsed for `docs` and `boilerplate`. A file card
that has findings shows a plain dot next to its path. When the file is expanded,
each finding renders inline under its exact code line (matched by `start_line`),
using the existing Agent-runs `FindingCard` (severity, title, rationale,
Accept/Dismiss). The code line gets a coloured left-edge stripe and a
right-aligned label: CRITICAL→`blocker`, WARNING→`warning`,
SUGGESTION→`suggestion`. A "Smart order / Original order" toggle switches back
to the existing flat list in GitHub order.

Server side: a pure, reusable `classifyFile(path)` classifier with no HTTP or DB
dependency (a later L08 task will reuse it as a prompt-assembly filter), and a new
`GET /pulls/:id/smart-diff` route returning the existing `SmartDiffResponse`
contract.

**Non-goals.**
- `pseudocode_summary`: always `null`. Real `split_suggestion`: always
  `too_big: false`, `proposed_splits: []`. The existing `smartDiff.largeTitle` /
  `largeBody` i18n keys stay unused.
- No DB schema change and no migration.
- No change to the Findings tab, `FindingsPanel`, or the PR-list popover.
- The existing hard-coded English strings in `DiffTab` ("Files changed · N
  files", "Show/Hide comments") are not moved to i18n. They are out of scope.
- No new e2e (`e2e/`) flow. Browser verification is manual (section 8).
- The client does not classify files itself. The role always comes from the
  server.

## 2. Context read

Files read (all under `/Users/mtakumi/Projects/dev-digest/`):
- `CLAUDE.md`, `server/AGENTS.md`, `client/AGENTS.md`, `INSIGHTS.md`,
  `server/INSIGHTS.md`, `client/INSIGHTS.md`
- Skills: `onion-architecture`, `fastify-best-practices` (+ `rules/routes.md`),
  `zod` (+ `AGENTS.md`), `react-frontend-architecture`, `react-best-practices`,
  `react-testing-library`, `security`, `typescript-expert` (head), `design`,
  `engineering-insights`
- Server: `src/app.ts`, `src/modules/index.ts`, `src/modules/_shared/{context,schemas}.ts`,
  `src/modules/reviews/{routes,service,repository,helpers}.ts`,
  `src/modules/reviews/repository/{pull.repo,review.repo}.ts`,
  `src/modules/pulls/routes.ts`, `src/modules/intent/{routes,repository,ports}.ts`,
  `src/modules/translation/{routes,repository,ports}.ts`,
  `src/vendor/shared/contracts/{brief,review-api}.ts`, `vitest.config.ts`,
  `test/contracts.test.ts` (SmartDiff case), `test/reviews.it.test.ts` (head),
  `test/routes-smoke.test.ts`, `reviewer-core/src/review/reduce.ts`,
  `reviewer-core/src/grounding.ts` (grep: grounding uses **new-file** line numbers)
- Client: `src/app/repos/[repoId]/pulls/[number]/page.tsx`,
  `_components/DiffTab/DiffTab.tsx`, `_components/FindingCard/{FindingCard.tsx,constants.ts,helpers.ts,styles.ts,FindingCard.test.tsx}`,
  `_components/FindingsTab/FindingsTab.tsx`, `_components/ReviewRunAccordion/ReviewRunAccordion.tsx`,
  `_components/FindingsPanel/FindingsPanel.tsx`,
  `src/components/diff-viewer/{index,comments,constants,helpers,styles}.ts`,
  `DiffViewer/DiffViewer.tsx`, `FileCard/FileCard.tsx`, `CodeLine/CodeLine.tsx`,
  `src/lib/hooks/{reviews,keys}.ts`, `src/lib/api.ts` (head), `src/lib/types.ts`,
  `src/lib/providers.tsx` (grep: `staleTime: 30_000`), `src/test/{smoke.test.tsx,render-intl.tsx}`,
  `src/vendor/ui/kit/Tabs.tsx`, `src/vendor/ui/primitives/tokens.ts` (`SEV`),
  `messages/en/prReview.json`, `messages/en/shell.json` (`diffViewer` block)
- `design/DevDigest Design (standalone) (3).html`: grep found no Smart Diff strings
  (the file is a bundle). The chat screenshots, as described by the coordinator,
  are the only visual reference.

Relevant INSIGHTS entries:
- `INSIGHTS.md` (root), 2026-09-18, refined 2026-09-20: *"`server/src/vendor/shared`
  and `client/src/vendor/shared` are meant to be the same contracts package but
  there is no sync script between them … Don't overwrite one copy with the other;
  splice only the block you own into both"*. This governs step 1.
- `server/INSIGHTS.md`, 2026-09-18: *"The PR list's 'latest review' columns … are
  computed by one `IN`-query against `reviews`, ordered `desc(createdAt)`,
  first-seen-per-PR in JS … A new metric that must come from the SAME run as an
  existing one (e.g. score) should `leftJoin` onto that same query"*. This is the
  source of the "latest review" rule chosen in step 6.
- `client/INSIGHTS.md`, 2026-09-24: *"`client/src/lib/feature-models.ts` is a
  hand-mirrored copy … (the client can't import shared runtime values)"*. So the
  client must not rely on `SmartDiffRole.options` at runtime. Group order comes
  from the server response (step 16).
- `client/INSIGHTS.md`, 2026-09-20: *"`@testing-library/user-event` is NOT a client
  dependency … component tests use the `fireEvent`-based shim `src/test/user.ts`
  … and `src/test/render-intl.tsx`"*. This overrides the RTL skill's "always
  userEvent" rule (step 20).
- `client/INSIGHTS.md`, 2026-09-19: *"Never run `next build` in `client/` while
  `pnpm dev` is up"*. Relevant to validation.
- `INSIGHTS.md` (root), Tool notes 2026-09-18: *"`pnpm` is not on `PATH` … use
  `npx --yes pnpm@10 <cmd>`"*, and Docker Desktop must be running for `.it.test.ts`.

## 3. Affected modules

**server/**
- `src/vendor/shared/contracts/brief.ts`: **modified**. Extend `SmartDiffRole`
  (sanctioned exception, see section 4).
- `src/modules/reviews/smart-diff/constants.ts`: **new**. `ROLE_ORDER` (display
  order), `CLASSIFY_PRECEDENCE`, and the per-role pattern data.
- `src/modules/reviews/smart-diff/classify.ts`: **new**. Pure
  `classifyFile(path): SmartDiffRole`.
- `src/modules/reviews/smart-diff/classify.test.ts`: **new**. Table-driven unit test.
- `src/modules/reviews/smart-diff/build.ts`: **new**. Pure
  `buildSmartDiff(files, anchors): SmartDiff`.
- `src/modules/reviews/smart-diff/build.test.ts`: **new**. Unit test.
- `src/modules/reviews/repository/review.repo.ts`: **modified**. Add
  `latestReviewFindingAnchors(db, prId)`.
- `src/modules/reviews/repository.ts`: **modified**. Delegate method on
  `ReviewRepository`.
- `src/modules/reviews/service.ts`: **modified**. Add
  `ReviewService.smartDiff(workspaceId, prId)`.
- `src/modules/reviews/routes.ts`: **modified**. Add the `GET /pulls/:id/smart-diff`
  route and update the header doc comment.
- `test/contracts.test.ts`: **modified**. Parse the new roles.
- `test/reviews.it.test.ts`: **modified**. Route integration cases.

**client/**
- `src/vendor/shared/contracts/brief.ts`: **modified**. Byte-identical to the server copy.
- `messages/en/prReview.json`: **modified**. Keys under `smartDiff`.
- `messages/en/shell.json`: **modified**. Keys under `diffViewer`.
- `src/lib/hooks/keys.ts`: **modified**. `prSmartDiff` key.
- `src/lib/hooks/reviews.ts`: **modified**. `usePrSmartDiff` hook.
- `src/components/diff-viewer/findings.ts`: **new**. `DiffFindingsApi` type plus pure
  anchoring helpers.
- `src/components/diff-viewer/findings.test.ts`: **new**.
- `src/components/diff-viewer/constants.ts`: **modified**. Severity rank and line-label keys.
- `src/components/diff-viewer/styles.ts`: **modified**. Dot, stripe, label, and finding-rail styles.
- `src/components/diff-viewer/CodeLine/CodeLine.tsx`: **modified**. Stripe, label,
  and inline findings.
- `src/components/diff-viewer/FileCard/FileCard.tsx`: **modified**. Findings dot,
  anchoring, and unanchored findings.
- `src/components/diff-viewer/DiffViewer/DiffViewer.tsx`: **modified**. Passes
  `findings` through.
- `src/components/diff-viewer/index.ts`: **modified**. Also exports `FileCard` and
  `type DiffFindingsApi`.
- `src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx`: **modified**.
- `.../DiffTab/helpers.ts`: **new**. `latestReview`, `buildViewGroups`, `findingsByPath`,
  `linesByPath`.
- `.../DiffTab/helpers.test.ts`: **new**.
- `.../DiffTab/DiffTab.test.tsx`: **new**.
- `.../DiffTab/_components/SmartDiffGroups/{SmartDiffGroups.tsx,constants.ts,styles.ts,index.ts,SmartDiffGroups.test.tsx}`: **new**.
- `src/app/repos/[repoId]/pulls/[number]/page.tsx`: **modified**. Passes
  `repoFullName`/`headSha` to `DiffTab` and invalidates smart-diff in `onRunDone`.

**reviewer-core/**, **e2e/**: no changes.

## 4. Contracts touched

- **`SmartDiffRole`** in `server/src/vendor/shared/contracts/brief.ts:81` and
  `client/src/vendor/shared/contracts/brief.ts:81`. Change
  `z.enum(['core', 'wiring', 'boilerplate'])` to
  `z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate'])`. Write the members
  in exactly this order, which is also the display order.
  **This is an explicit, assignment-sanctioned exception to the vendor/shared
  do-not-touch rule.** Only these two lines change: splice the one line into both
  copies, and do not copy one file over the other (root INSIGHTS). The coordinator
  verified the two `brief.ts` copies are byte-identical before the edit. After the
  edit, `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts`
  must print nothing.
- `SmartDiffFile`, `SmartDiffGroup`, `SmartDiff`, `ProposedSplit`: unchanged.
- `SmartDiffResponse` (`contracts/review-api.ts:64`, both copies): reused unchanged
  as the route's `response: { 200: … }` schema and as the client's fetch type.
- `FindingRecord` / `ReviewRecord` (`review-api.ts`): read-only use on the client.
- No DB schema change. No migration. No new ports. No new container entry.
- **New HTTP endpoint:** `GET /pulls/:id/smart-diff`. `:id` is a uuid validated by
  `IdParams`. Returns `200 SmartDiffResponse`, or `404 {error:{code:'not_found'}}`
  when the PR is not in the caller's workspace (same `NotFoundError` path as
  `GET /pulls/:id/reviews`), or `422` for a non-uuid id.

## 5. Skills for implementer

| Skill | Governs | Key rules for this task |
|---|---|---|
| **onion-architecture** | Steps 2–8 | `classify.ts`/`build.ts` import nothing but TS and a *type* from `@devdigest/shared` (no fastify/drizzle/zod runtime). The new repository method returns a mapped plain shape `{file,startLine}[]`, not `$inferSelect` rows. The route only parses input, calls one service method, and returns. |
| **fastify-best-practices** | Step 8 | Declare `schema: { params: IdParams, response: { 200: SmartDiffResponse } }` so one Zod schema drives validation and serialization (as in `intent/routes.ts:18-26`). No hand-rolled `.parse`. Errors are thrown as `NotFoundError` from the service and mapped by the global handler. |
| **drizzle-orm-patterns** | Step 6 | Select only the needed columns. Use `.orderBy(desc(createdAt)).limit(1)` for the latest review. No schema change, so no `db:generate`. |
| **zod** | Steps 1, 8 | `schema-use-enums`: extend the enum and don't loosen it to `z.string()`. `type-use-z-infer`: keep `SmartDiffRole` as `z.infer`. Validate at the boundary (route schema) only. |
| **typescript-expert** | Steps 1–5, 12–17 | `Record<SmartDiffRole, …>` maps must be exhaustive, so extending the enum surfaces every missing role at typecheck. No `any`. |
| **react-frontend-architecture** | Steps 11–19 | Colocate: `SmartDiffGroups` lives under `DiffTab/_components/` (one consumer). The shared `diff-viewer` must not import from `app/**`, so `FindingCard` is injected through `DiffFindingsApi.renderFinding`. Data goes through `lib/hooks` → `api.ts`. Server data is never copied into `useState`. Strings go in `messages/`. |
| **react-best-practices** | Steps 13–18 | Derive, don't store: groups, counts and anchors are computed in render or `useMemo`. Only UI state goes in `useState` (order toggle, collapsed groups). Use `count > 0 &&`, never `count &&`. Stable keys: file path and finding id, not the index. Icon-only or dot indicators get `aria-label`. |
| **react-testing-library** | Step 20 | 1–3 flow tests per component, queried by role or text. Mock at the hook/API boundary. **Override:** use `src/test/user.ts` / `fireEvent`, not `userEvent` (not installed; client INSIGHTS). |
| **security** | Steps 6–8, 13 | A01: workspace scoping through `getContext` + `getPull(workspaceId, prId)` before any read. File paths and finding text render only through JSX or the existing `Markdown` (no `dangerouslySetInnerHTML`). The classifier uses string ops only, no `RegExp` built from input (A05 ReDoS). |
| **design** | Steps 10, 13, 14, 17, 18 | The chat screenshots are the source of truth. No visuals beyond: toggle, group header (label, description, finding-file dot and count, file count), file dot, line stripe and label, inline FindingCard. |

`next-best-practices` does not apply: no route, layout or RSC boundary changes.
All touched components are already `"use client"`. `drizzle-kit` /
`postgresql-table-design` do not apply because the DB schema is unchanged.

## 6. Architecture constraints

- **Server module home: inside `reviews`** (`server/src/modules/reviews/smart-diff/`).
  The smart diff is a read model over data the `reviews` module already owns:
  `pr_files` via `ReviewRepository.getPrFiles`, the PR via `getPull`, and
  `reviews`/`findings`. The sibling `GET /pulls/:id/reviews` also lives here, and
  the future L08 prompt-assembly filter will run in `reviews/run-executor.ts`,
  the same module, so it can import `smart-diff/classify.ts` directly with no
  cross-module reach. Rejected alternatives:
  - A new `modules/smart-diff/`: it would either import
    `reviews/repository/pull.repo.ts` (forbidden by onion-architecture: "a module
    does not import another module's … repository") or re-query PR and files in
    its own repository, which the task forbids.
  - `modules/pulls/`: it has no service/repository split, and adding one just for
    this route would pull more legacy code into scope.
- Keep `routes.ts → service.ts → repository.ts`. `ReviewService` already takes the
  whole `Container` (legacy). Do not refactor that. Just add a method.
- `classify.ts` and `build.ts` must stay free of Fastify, Drizzle, Zod runtime
  imports and `Container`, so they can be called with no HTTP context. Allowed
  import: `import type { SmartDiffRole, SmartDiff } from '@devdigest/shared'`.
- Client: the shared `src/components/diff-viewer/**` must never import from
  `src/app/**`. The feature injects `FindingCard` rendering through
  `DiffFindingsApi`.
- Client naming: `SmartDiffGroups/` is a PascalCase folder with lowercase siblings
  and an `index.ts` that re-exports only the component. New lib/helper files are
  lowercase.
- Tests are co-located with the same base name (`classify.test.ts`,
  `build.test.ts`, `findings.test.ts`, `helpers.test.ts`,
  `SmartDiffGroups.test.tsx`, `DiffTab.test.tsx`). Server `vitest.config.ts:14`
  already includes `src/**/*.test.ts`. The route integration case extends the
  existing `server/test/reviews.it.test.ts` (Testcontainers suite).
- Do-not-touch: `client/src/vendor/ui/**` (the toggle is built from the existing
  `Button`), `server/src/db/migrations/**`, and all `pnpm-lock.yaml`. **No new
  dependency:** globs are matched by hand-written string predicates, not
  `minimatch`/`picomatch`, because a dependency would require a lockfile change.
  `*/vendor/shared/**` is touched only for the sanctioned `SmartDiffRole` line.

## 7. Steps

**Step 1: Extend the contract (both copies).** *zod, typescript-expert*
Files: `server/src/vendor/shared/contracts/brief.ts:81` and
`client/src/vendor/shared/contracts/brief.ts:81`. Replace the enum with
`z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate'])`. Nothing else in
either file changes. Then:
- run `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts`,
  which must print nothing;
- run `grep -n "review-api" server/src/vendor/shared/index.ts client/src/vendor/shared/index.ts`
  to confirm `SmartDiffResponse` is re-exported from `@devdigest/shared`. It is
  already imported that way on the client types path. If it is *not* exported,
  stop and report rather than editing `index.ts`.

**Step 2: Classifier constants.** *onion-architecture*
File: `server/src/modules/reviews/smart-diff/constants.ts` (new). Export:
- `ROLE_ORDER: readonly SmartDiffRole[] = ['core','tests','wiring','docs','boilerplate']`,
  the **display** order of groups.
- `CLASSIFY_PRECEDENCE = ['boilerplate','tests','wiring','docs'] as const`, the
  **matching** order (first match wins, `core` is the fallback). Put a comment
  on it saying the two orders are deliberately different.
- Pattern data per role as plain `as const` string arrays (no functions, no RegExp):
  - boilerplate: `BOILERPLATE_BASENAMES = ['pnpm-lock.yaml','package-lock.json','yarn.lock']`,
    `BOILERPLATE_SUFFIXES = ['.lock','.snap','.min.js']`,
    `BOILERPLATE_INFIXES = ['.generated.']`,
    `BOILERPLATE_ROOT_DIRS = ['dist','build']`,
    `BOILERPLATE_ANY_DIRS = ['__snapshots__']`.
  - tests: `TEST_SUFFIXES = ['.test.ts','.test.tsx','.spec.ts']` (`.it.test.ts`
    is covered by `.test.ts`), `TEST_ANY_DIRS = ['test','tests','__tests__']`,
    `TEST_ROOT_DIRS = ['e2e']`.
  - wiring: `WIRING_BASENAMES = ['index.ts','index.js']`, `WIRING_INFIXES = ['.config.']`,
    `WIRING_PREFIXES = ['.eslintrc','.env']`, `tsconfig*.json` (prefix `tsconfig`
    + suffix `.json`), `docker-compose*.yml` (prefix `docker-compose` + suffix
    `.yml`), `WIRING_ROOT_DIRS = ['.github','.claude']`.
  - docs: `DOCS_SUFFIXES = ['.md']`, `DOCS_ROOT_DIRS = ['docs']`,
    `DOCS_PREFIXES = ['README','CHANGELOG']`, `DOCS_BASENAMES = ['LICENSE']`.

**Step 3: `classifyFile`.** *onion-architecture, security, typescript-expert*
File: `server/src/modules/reviews/smart-diff/classify.ts` (new). Export
`classifyFile(path: string): SmartDiffRole`. Semantics (gitignore-style; document
them in the JSDoc):
- Normalise: replace `\` with `/` and strip a leading `./`. Split into
  `dirs` (all segments but the last) and `base` (the last segment).
- A pattern **without `/`** (`*.lock`, `index.ts`, `.env*`, `*.config.*`, `*.md`,
  `README*`) matches the **basename at any depth**.
- A pattern of the form `x/**` (`dist/**`, `build/**`, `e2e/**`, `docs/**`,
  `.github/**`, `.claude/**`) is **root-anchored**: `dirs[0] === x`. This follows
  the spec literally: only `__snapshots__`, `test`, `tests`, `__tests__` use
  `**/`, so `client/dist/a.js` is **not** boilerplate.
- `**/dir/**` matches when `dirs` includes `dir` (directory segments only, not the
  basename).
- Evaluate roles in `CLASSIFY_PRECEDENCE` order and return the first match, else
  `'core'`. Implement as one small predicate per role
  (`isBoilerplate`/`isTest`/`isWiring`/`isDocs`) that reads the Step 2 data,
  dispatched through a `Record<Exclude<SmartDiffRole,'core'>, (p) => boolean>`.
  Matching is case-sensitive, with only `String.prototype`
  `startsWith/endsWith/includes/===`.

**Step 4: Classifier unit test.** *react-testing-library n/a; follow the zod/TS rules for fixtures*
File: `server/src/modules/reviews/smart-diff/classify.test.ts` (new). Use one
`it.each` table of `[path, expectedRole]`. It must contain every row listed in
section 8, including the three precedence cases.

**Step 5: `buildSmartDiff` + test.** *onion-architecture*
File: `server/src/modules/reviews/smart-diff/build.ts` (new).
Signature:
`buildSmartDiff(files: {path:string; additions:number; deletions:number}[], anchors: {file:string; startLine:number}[]): SmartDiff`.
- Classify each file with `classifyFile`. Keep the input order of files within a
  role (the client re-orders by GitHub order anyway, see step 16).
- `finding_lines` for a file is the **unique, ascending** `startLine` of every
  anchor whose `file === path` (exact string equality). Anchors for paths not in
  `files` are ignored.
- `pseudocode_summary: null`.
- Groups are emitted in `ROLE_ORDER`, **omitting roles with zero files**. This
  matches the screenshots, which only show populated groups.
- `split_suggestion = { too_big: false, total_lines: Σ(additions+deletions), proposed_splits: [] }`.

File: `server/src/modules/reviews/smart-diff/build.test.ts` (new). Cases: group
order, empty-role omission, finding_lines dedupe/sort, a foreign-path anchor
ignored, `total_lines` sum, and an empty-files input giving `{groups: [], total_lines: 0}`.

**Step 6: Repository: latest-review anchors.** *drizzle-orm-patterns, onion-architecture*
File: `server/src/modules/reviews/repository/review.repo.ts`. Add
`latestReviewFindingAnchors(db, prId): Promise<{ file: string; startLine: number }[]>`:
1. `select({ id: t.reviews.id }).from(t.reviews).where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review'))).orderBy(desc(t.reviews.createdAt)).limit(1)`.
2. If there is no row, return `[]`. Otherwise
   `select({ file: t.findings.file, startLine: t.findings.startLine }).from(t.findings).where(eq(t.findings.reviewId, id))`.
   Include **all** findings of that review (accepted, dismissed, and any `kind`),
   the same way `ReviewRunAccordion` counts `findings.length`.
**"Latest review" rule (decided):** the newest `reviews` row with `kind='review'`
by `created_at`. This is the same rule the PR list uses for its score and
findings columns (`server/src/modules/pulls/routes.ts:120-131`), and the review
the Findings tab opens by default (`FindingsTab.tsx:162`, `defaultOpen={i === 0}`
over the newest-first list). So the diff's highlighted findings match the PR
list's findings breakdown.
File: `server/src/modules/reviews/repository.ts`. Add a delegating
`latestReviewFindingAnchors(prId)` to `ReviewRepository`, next to `reviewsForPull`.

**Step 7: Service method.** *onion-architecture*
File: `server/src/modules/reviews/service.ts` (Reads section, after
`reviewsForPull`). Add
`async smartDiff(workspaceId: string, prId: string): Promise<SmartDiff>`:
- call `this.repo.getPull(workspaceId, prId)`, and throw `NotFoundError('Pull request not found')` if absent;
- `const [files, anchors] = await Promise.all([this.repo.getPrFiles(prId), this.repo.latestReviewFindingAnchors(prId)])`;
- `return buildSmartDiff(files.map(f => ({ path: f.path, additions: f.additions, deletions: f.deletions })), anchors)`.

**Step 8: Route.** *fastify-best-practices, zod, security*
File: `server/src/modules/reviews/routes.ts`. In the "Reads" section, after
`GET /pulls/:id/reviews` (lines 129-132), add:
`app.get('/pulls/:id/smart-diff', { schema: { params: IdParams, response: { 200: SmartDiffResponse } } }, async (req) => { const { workspaceId } = await getContext(container, req); return service.smartDiff(workspaceId, req.params.id); });`
Import `SmartDiffResponse` from `@devdigest/shared`. Add a line to the header doc
comment (lines 10-17): `GET /pulls/:id/smart-diff → files grouped by role + latest-review finding lines`.
No per-route rate limit: it is a cheap DB read covered by the global limit.

**Step 9: Server contract and integration tests.** *zod, fastify-best-practices*
- `server/test/contracts.test.ts:107-118`. Add a case where `SmartDiff.parse`
  accepts groups with roles `tests` and `docs`, and `SmartDiffRole.parse('other')` throws.
- `server/test/reviews.it.test.ts`. Add cases inside the existing `d(...)` suite,
  reusing `setupRepoAndPr` (one file `src/config.ts`, so `core`):
  (a) before any review, `GET /pulls/:id/smart-diff` returns 200 with
  `groups = [{ role:'core', files:[{ path:'src/config.ts', additions:1, deletions:0, finding_lines:[], pseudocode_summary:null }] }]`
  and `split_suggestion.total_lines = 1`;
  (b) after the existing review flow (`REVIEW_FIXTURE` with a grounded finding
  on line 11), `finding_lines` is `[11]`;
  (c) a random uuid returns 404;
  (d) `GET /pulls/not-a-uuid/smart-diff` returns 422.
  Mirror how the suite already runs a review and waits (`waitForPrRuns`). The
  `openrouter` intent mock in `appWith()` already exists (server INSIGHTS
  2026-09-24).

**Step 10: i18n strings.** *design, react-frontend-architecture*
- `client/messages/en/prReview.json`, `smartDiff` block (the existing keys are
  unused anywhere, verified by grep):
  - change `coreLabel` from `"Core"` to `"Core logic"` (screenshot label);
  - add `testsLabel: "Tests"`, `docsLabel: "Docs"`;
  - add descriptions: `coreDescription: "The substance of the change — review closely"`,
    `wiringDescription: "Hooks the core into the app"`,
    `boilerplateDescription: "Generated / mechanical — skim"`,
    `testsDescription: "Proves the change works"`,
    `docsDescription: "Explains the change"` (confirmed by the coordinator from
    the chat screenshots — no placeholder);
  - add `smartOrder: "Smart order"`, `originalOrder: "Original order"`,
    `orderToggleLabel: "File order"` (group `aria-label`), and
    `filesWithFindings: "{count} files with findings"` (`aria-label` for the group-header dot);
  - keep `filesCount: "{count} files"` as it is.
- `client/messages/en/shell.json`, `diffViewer` block: add
  `hasFindings: "Has findings"` (file-dot `aria-label`/`title`) and
  `findingLabel: { "CRITICAL": "blocker", "WARNING": "warning", "SUGGESTION": "suggestion" }`.

**Step 11: Data hook.** *react-frontend-architecture*
- `client/src/lib/hooks/keys.ts`: add
  `prSmartDiff: (prId) => ["reviews", prId, "smart-diff"] as const`. It sits under
  the `reviews(prId)` prefix **on purpose**, so every existing
  `invalidateQueries({queryKey: queryKeys.reviews(prId)})` (run review,
  accept/dismiss, delete review, delete run) also refreshes the smart diff.
  Comment this.
- `client/src/lib/hooks/reviews.ts`: add
  `usePrSmartDiff(prId)` = `useQuery({ queryKey: queryKeys.prSmartDiff(prId), queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`), enabled: !!prId })`.
  Import the `SmartDiffResponse` type from `@devdigest/shared`.

**Step 12: diff-viewer findings plumbing (shared, feature-agnostic).** *react-frontend-architecture, typescript-expert*
- `client/src/components/diff-viewer/findings.ts` (new), modelled on `comments.ts`:
  - `export interface DiffFindingsApi { linesByPath: ReadonlyMap<string, readonly number[]>; byPath: ReadonlyMap<string, FindingRecord[]>; renderFinding: (f: FindingRecord) => React.ReactNode; }`.
    `linesByPath` comes from the server `finding_lines` and drives the file dot.
    `byPath` holds the latest-review finding records and drives the inline cards.
    `renderFinding` must return an element of a *stable* component type (the
    caller returns `<FindingCard …/>`), so no component identity is created per
    render.
  - `partitionFindings(findings, renderedKeys): { matched: Map<string, FindingRecord[]>; unanchored: FindingRecord[] }`,
    keyed by `lineKey("RIGHT", f.start_line)` from `comments.ts`. Grounding
    uses new-file lines, so only `RIGHT` is used.
  - `worstSeverity(findings): Severity`, using `SEVERITY_RANK`.
- `client/src/components/diff-viewer/constants.ts`: add
  `SEVERITY_RANK = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1, INFO: 0 } as const`. The
  i18n line-label key is `diffViewer.findingLabel.<SEVERITY>`. Severities without
  a key (e.g. INFO) render the stripe but no label.
- `client/src/components/diff-viewer/styles.ts`: add `findingDot` (a small circle,
  `var(--crit)`, about 7px, `flexShrink: 0`), `findingRail` (same indentation as
  `cs.thread`: `margin: "6px 14px 8px 58px"`, column, gap 8), `findingLineLabel`
  (right-aligned, `marginLeft: "auto"`, 11–12px, colour passed in), and
  `findingStripeFor(color)` returning `{ boxShadow: \`inset 3px 0 0 ${color}\` }`. Use
  box-shadow, **not** `borderLeft`, to avoid the shorthand/longhand warning noted in
  `FindingCard/styles.ts:7-8` and to avoid shifting the gutter width. Colours
  come from `SEV[sev].c` (`@devdigest/ui`).

**Step 13: `CodeLine`.** *react-best-practices, design, security*
File: `client/src/components/diff-viewer/CodeLine/CodeLine.tsx`. Add optional props
`findings?: FindingRecord[]` and `renderFinding?: DiffFindingsApi["renderFinding"]`.
When `findings && findings.length > 0`:
- merge `findingStripeFor(SEV[worst].c)` into the row style
  (`{...lineRowFor(ln.kind), ...stripe}`);
- append a right-aligned label span inside the row after `s.lineText`, with text
  `t(\`diffViewer.findingLabel.${worst}\`)` (only when the key exists for that
  severity) in `SEV[worst].c`. Use `useTranslations("shell")`;
- render `<div style={findingRail}>{findings.map(f => <React.Fragment key={f.id}>{renderFinding?.(f)}</React.Fragment>)}</div>`
  directly under the row and **before** the comment threads.
Hunk lines are unchanged. With no findings, the rendering is byte-for-byte the
current behaviour.

**Step 14: `FileCard`.** *react-best-practices, design*
File: `client/src/components/diff-viewer/FileCard/FileCard.tsx`. Add an optional
prop `findings?: DiffFindingsApi`.
- `hasFindings = (findings?.linesByPath.get(file.path)?.length ?? 0) > 0`.
- In the header, right after the path `<span>`, when `hasFindings`, render
  `<span role="img" aria-label={t("diffViewer.hasFindings")} title={…} style={s.findingDot} />`.
  This is distinct from the `MessageSquare` comment badge (lines 67-74), which
  stays as it is. The path span has `flex: 1`, so move the dot into a small
  inline wrapper with the path, or give the dot `order` so it sits next to the
  text. The implementer picks whichever matches the screenshot; either way the
  dot sits immediately after the path text, not at the far right.
- A `useMemo` like the comment one (lines 43-49) computes
  `{ matched, unanchored } = partitionFindings(findings?.byPath.get(file.path) ?? [], renderedKeys)`
  (reuse the same `renderedKeys` set; restructure so it is built once for both).
- Pass `findings={matchedForLine}` and `renderFinding` to each `CodeLine`.
  `findingsForLine` is a module-level helper next to `threadsForLine`, and should
  use `keysForLine`, filtered to `RIGHT:` keys.
- After the lines, when `unanchored.length > 0`, render them in a `findingRail`
  block (no extra title). They are findings whose line is no longer in the
  patch, for example after a new push. Showing them without a header avoids
  silently hiding a finding while adding no new visual element.
- Per-file `open` state and the `AUTO_EXPAND_MAX_LINES` rule are **unchanged**.

**Step 15: `DiffViewer` + barrel.** *react-frontend-architecture*
- `DiffViewer.tsx`: add an optional `findings?: DiffFindingsApi` and pass it to each
  `FileCard`. Change `key={i}` to `key={f.path}` (paths are unique per PR; the
  react-best-practices key rule).
- `diff-viewer/index.ts`: add `export { FileCard } from "./FileCard";` and
  `export type { DiffFindingsApi } from "./findings";`.

**Step 16: DiffTab helpers.** *react-frontend-architecture, typescript-expert*
File: `.../DiffTab/helpers.ts` (new, pure, no React):
- `latestReview(reviews: ReviewRecord[] | undefined): ReviewRecord | undefined`
  returns `reviews?.find(r => r.kind === "review")`. The list is already
  newest-first (`review.repo.ts:66`). This mirrors the step 6 server rule; put a
  comment pointing at `review.repo.ts` `latestReviewFindingAnchors`.
- `findingsByPath(findings: FindingRecord[]): Map<string, FindingRecord[]>`.
- `linesByPath(sd: SmartDiffResponse): Map<string, number[]>`.
- `buildViewGroups(files: PrFile[], sd: SmartDiffResponse): ViewGroup[]`, where
  `ViewGroup = { role: SmartDiffRole; files: PrFile[]; findingFiles: number }`.
  Build `path → role` from `sd.groups`, then iterate `files` in their **GitHub
  order** and bucket by role. A file missing from the response (for example
  `pr_files` rewritten between the two fetches) goes to `core`, so a file is
  never hidden from the reviewer. Emit groups in the order of `sd.groups`,
  inserting `core` first if it was created only for leftovers. Drop groups that
  end up empty. `findingFiles` counts the group's files whose `finding_lines`
  length is greater than 0.

**Step 17: `SmartDiffGroups` component.** *react-frontend-architecture, react-best-practices, design*
Folder `.../DiffTab/_components/SmartDiffGroups/` (new):
- `constants.ts`: `DEFAULT_COLLAPSED_ROLES: ReadonlySet<SmartDiffRole> = new Set(["docs","boilerplate"])`,
  plus `ROLE_TEXT: Record<SmartDiffRole, { label: string; description: string }>`
  holding the i18n **keys** (`"smartDiff.coreLabel"`, `"smartDiff.coreDescription"`,
  and so on). This record must be exhaustive.
- `styles.ts`: group section and header styles. Reuse the diff-viewer visual
  language (`var(--border)`, `var(--text-muted)`, the `chevronFor` rotation
  idiom). The finding-files dot uses `var(--crit)`.
- `SmartDiffGroups.tsx` (`"use client"`), with props
  `{ groups: ViewGroup[]; commenting?: DiffCommentApi; findings?: DiffFindingsApi }`:
  - state `collapsed: Set<SmartDiffRole>`, lazily initialised from
    `DEFAULT_COLLAPSED_ROLES`. This is **group** collapse only and is separate
    from each `FileCard`'s own `open` state;
  - for each group, a header `<div role="button" tabIndex={0} aria-expanded onClick onKeyDown(Enter/Space)>`
    (same a11y idiom as `ReviewRunAccordion.tsx:71-87`) containing a chevron,
    the **label** (bold), the description (muted, preceded by an em dash as in
    the screenshot), a flex spacer, then
    `{g.findingFiles > 0 && <span aria-label={t("smartDiff.filesWithFindings",{count})}>● {g.findingFiles}</span>}`,
    then `t("smartDiff.filesCount", { count: g.files.length })`;
  - when expanded, `g.files.map(f => <FileCard key={f.path} file={f} commenting={commenting} findings={findings} />)`
    inside a column with the same gap as `s.list`;
  - one small internal `GroupSection` component in the same file is fine. Keep
    the file under 200 lines.
- `index.ts`: `export { SmartDiffGroups } from "./SmartDiffGroups";`.

**Step 18: `DiffTab`.** *react-frontend-architecture, react-best-practices, design*
File: `.../DiffTab/DiffTab.tsx`.
- New props: `repoFullName?: string | null; headSha?: string | null`.
- Data: `usePrSmartDiff(prId)`, `usePrReviews(prId)` (shares the page's cached
  query), `useFindingAction()`.
- UI state: `const [order, setOrder] = useState<"smart" | "original">("smart")`.
- Derived (with `useMemo` where it maps arrays):
  `latest = latestReview(reviews)`, and
  `findings: DiffFindingsApi | undefined = smartDiff ? { linesByPath: linesByPath(smartDiff), byPath: findingsByPath(latest?.findings ?? []), renderFinding } : undefined`,
  where `renderFinding = (f) => <FindingCard f={f} defaultExpanded pending={action.isPending} repoFullName={repoFullName} headSha={headSha} onAction={(a) => action.mutate({ findingId: f.id, action: a, prId: prId! })} />`.
  Import `FindingCard` from `../FindingCard` (same feature). Use
  `defaultExpanded` because the screenshot shows rationale and Accept/Dismiss
  without a click. Do **not** reuse `FindingsPanel`: it installs a global j/k/a/d
  `keydown` listener per instance.
- Toggle: the coordinator has now viewed the actual screenshots (previously
  unavailable to the planner) — the toggle sits in its own header row, not
  inside the existing `SectionLabel`. Layout: a small caps eyebrow label
  ("REVIEWER-ORDERED DIFF"-style, reuse `SectionLabel`'s own eyebrow styling if
  it exposes one, else a plain muted uppercase span) above a row with
  "N files · +A −D" stats on the left and the toggle on the right. The toggle
  itself is a single bordered segmented control (one shared border, not two
  separate buttons) with two segments, "Smart order" / "Original order", the
  active segment visually distinct (bold/filled). Build it as a
  `<div role="group" aria-label={t("smartDiff.orderToggleLabel")} style={s.segmented}>`
  wrapping two `Button kind="ghost" size="sm"` (or plain `<button>`s styled to
  read as one control, implementer's call) with `active={order === …}`, labelled
  `t("smartDiff.smartOrder")` / `t("smartDiff.originalOrder")`
  (`useTranslations("prReview")`). The existing "Show/Hide comments" button
  stays in its current `SectionLabel` right slot, unchanged — the two controls
  are on different rows in the screenshot.
- Body: if `order === "smart" && smartDiff`, render
  `<SmartDiffGroups groups={buildViewGroups(files, smartDiff)} commenting={commenting} findings={findings} />`.
  Otherwise render `<DiffViewer files={files} commenting={commenting} findings={findings} />`.
  While smart-diff is loading or has errored, the flat view renders, so the tab
  never blanks. Findings dots and inline cards appear in **both** orders.

**Step 19: Page wiring.** *react-frontend-architecture*
File: `src/app/repos/[repoId]/pulls/[number]/page.tsx`.
- Lines 169-176: pass `repoFullName={repoFullName}` and `headSha={pr.head_sha}` to `DiffTab`.
- `onRunDone` (lines 159-165): add
  `if (prId) qc.invalidateQueries({ queryKey: queryKeys.prSmartDiff(prId) });`.
  `refetchReviews()` is a refetch, not an invalidation, so the prefix trick in
  step 11 does not cover this path, and the global `staleTime` is 30s
  (`providers.tsx:28`).

**Step 20: Client tests.** *react-testing-library (with the INSIGHTS override)*
- `src/components/diff-viewer/findings.test.ts`: `partitionFindings`
  (matched on `RIGHT:n`, unanchored when the line is absent, two findings on one
  line) and `worstSeverity`.
- `.../DiffTab/helpers.test.ts`: `buildViewGroups` (GitHub order kept within a
  role, a missing-from-response file goes to `core`, `findingFiles` counts files
  not findings, empty groups dropped) and `latestReview` (newest `kind:"review"`).
- `.../SmartDiffGroups/SmartDiffGroups.test.tsx`: render groups for all 5 roles.
  Assert header order and labels plus "N files". The docs and boilerplate file
  paths are not visible until their header is clicked; core, tests and wiring
  paths are visible. The finding-files dot shows the file count, not the finding
  count. A file with `finding_lines` shows the "Has findings" dot; expanding it
  shows the injected card under the line whose number equals `start_line`.
  Provide `prReview` and `shell` messages through `NextIntlClientProvider`, as in
  `FindingCard.test.tsx:38-44` / `smoke.test.tsx:36-42`.
- `.../DiffTab/DiffTab.test.tsx`: mock `@/lib/hooks/reviews` at the hook
  boundary (`usePrComments`, `useCreatePrComment`, `usePrSmartDiff`,
  `usePrReviews`, `useFindingAction`) and `@/lib/hooks/translation` (as
  `FindingCard.test.tsx:7-10` does). Flow: grouped view shows group headers,
  clicking "Original order" removes the headers and lists the files in the given
  order, and clicking "Smart order" restores them. Clicking Accept on an inline
  finding calls `mutate` with `{ findingId, action: "accept", prId }`. Use
  `fireEvent` / `src/test/user.ts`.

**Step 21: Validate** (section 8), then hand over to Completion (section 9 follow-ups).

## 8. Acceptance checks

Run these from each package directory. Use `pnpm <script>`, or
`npx --yes pnpm@10 <script>` if `pnpm` is not on PATH (root INSIGHTS).

**Contract sync**
- `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts`
  prints nothing.

**server/**
- `pnpm typecheck`
- `pnpm test`. Docker must be running, or the `.it.test.ts` suites are skipped
  (`describe.skip`). Report whether `reviews.it.test.ts` actually ran.
- The classifier table in `classify.test.ts` must include at least these rows:

| path | expected | why |
|---|---|---|
| `__tests__/x.snap` | boilerplate | **precedence:** snapshot rule outranks tests `__tests__/**` |
| `.claude/skills/security/SKILL.md` | wiring | **precedence:** `.claude/**` outranks docs `**/*.md` |
| `e2e/README.md` | tests | **precedence:** `e2e/**` matches before `**/*.md`. The assignment made this call; don't second-guess it |
| `pnpm-lock.yaml` | boilerplate | lock file |
| `client/pnpm-lock.yaml` | boilerplate | lock file at depth |
| `package-lock.json` | boilerplate | lock file |
| `yarn.lock` | boilerplate | lock file |
| `Cargo.lock` | boilerplate | `*.lock` |
| `dist/index.js` | boilerplate | `dist/**` outranks wiring `index.js` |
| `build/app.js` | boilerplate | `build/**` |
| `src/__snapshots__/a.test.ts.snap` | boilerplate | `**/__snapshots__/**` |
| `src/api.generated.ts` | boilerplate | `*.generated.*` |
| `public/vendor.min.js` | boilerplate | `*.min.js` |
| `server/src/x.test.ts` | tests | `*.test.ts` |
| `client/src/A.test.tsx` | tests | `*.test.tsx` |
| `server/test/reviews.it.test.ts` | tests | `*.it.test.ts` |
| `src/a.spec.ts` | tests | `*.spec.ts` |
| `server/test/helpers/pg.ts` | tests | `**/test/**` |
| `src/__tests__/util.ts` | tests | `**/__tests__/**` |
| `e2e/flows/login.ts` | tests | `e2e/**` |
| `server/test/fixtures/README.md` | tests | tests precede docs |
| `client/src/components/diff-viewer/index.ts` | wiring | barrel |
| `server/vitest.config.ts` | wiring | `*.config.*` |
| `tsconfig.json` / `server/tsconfig.build.json` | wiring | `tsconfig*.json` |
| `.eslintrc.json` | wiring | `.eslintrc*` |
| `.env.example` | wiring | `.env*` |
| `docker-compose.yml` | wiring | `docker-compose*.yml` |
| `.github/workflows/ci.yml` | wiring | `.github/**` |
| `.claude/hooks/planner-guard.sh` | wiring | `.claude/**` |
| `README.md` | docs | `README*` / `*.md` |
| `server/AGENTS.md` | docs | `**/*.md` |
| `docs/plans/smart-diff_en.md` | docs | `docs/**` |
| `docs/diagram.png` | docs | `docs/**` |
| `CHANGELOG.md` | docs | `CHANGELOG*` |
| `LICENSE` | docs | `LICENSE` |
| `server/src/modules/reviews/service.ts` | core | fallback |
| `client/src/app/page.tsx` | core | fallback |
| `src/index.tsx` | core | only `index.ts`/`index.js` are barrels |
| `client/dist/a.js` | core | `dist/**` is root-anchored (literal spec) |
| `package.json` | core | not in any rule (literal spec) |

- Manual API check with the dev server running (don't restart a running one; root
  INSIGHTS): `curl -s localhost:3001/pulls/<prUuid>/smart-diff | jq` returns groups
  in core→tests→wiring→docs→boilerplate order with only non-empty groups.
  `curl -s -o /dev/null -w '%{http_code}' localhost:3001/pulls/00000000-0000-0000-0000-000000000000/smart-diff`
  returns `404`.

**client/**
- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`

**Browser check** (the design skill, compared against the chat screenshots). Use a
PR whose files span several roles. Navigate from `/` and click through; do not
deep-link (client INSIGHTS 2026-09-18).
1. Files changed tab, Smart order: group headers appear in the order Core logic →
   Tests → Wiring → Docs → Boilerplate (only populated ones), each with its
   description and "N files". Docs and Boilerplate are collapsed; the others are
   expanded. Files over 200 changed lines inside an expanded group are still
   individually collapsed.
2. A lock file appears under Boilerplate.
3. Run Review and wait for it to complete (stay on the tab or come back). Group
   headers show "● k" where k is the number of files with findings, without a
   page reload.
4. Those file cards show the plain dot next to the path, and the comment-count
   badge is unchanged.
5. Expanding such a file shows the FindingCard (severity, title, rationale,
   Accept/Dismiss) under the line numbered `start_line`, with a coloured stripe
   and a right-aligned `blocker`/`warning`/`suggestion` label. Accept or
   Dismiss updates the card state.
6. "Original order" shows the flat list in GitHub order with no group headers;
   "Smart order" restores the groups.
7. Screenshot both the dark and light themes, and compare them with the
   screenshots.

## 9. Risks & open questions

**Open questions — resolved by the coordinator after viewing the chat screenshots
(the planner did not have them):**
- **Q1 (resolved):** Tests/Docs descriptions are `"Proves the change works"` /
  `"Explains the change"` — see step 10.
- **Q2 (resolved):** the toggle is a single bordered segmented control ("Smart
  order" / "Original order") in its own header row above the file-count line,
  not inside the existing `SectionLabel` — see step 18.

**Decisions a reviewer should check** (resolved from code, flagged for the architecture and security reviewers):
- **Module home is `reviews/smart-diff/`, not a new module** (section 6 has the
  rationale and the rejected options). The architecture reviewer should confirm
  this against onion-architecture's "no cross-module repository import" rule.
- **Latest review is the newest `kind='review'` row by `created_at`.** After a
  multi-agent "Run all", only the last-inserted agent's findings appear in the
  diff, which is the same as the PR list's findings column
  (`pulls/routes.ts:120-131`). The page header's `findingsCount` counts
  findings across *all* reviews, so the diff can show fewer findings than the
  header. This is intentional, for consistency with the PR list. Ties on
  `created_at` have no tiebreaker, again mirroring the list.
- **Two data sources, one rule.** Dots and group counts come from server
  `finding_lines`. Inline cards come from the client's `usePrReviews` reduced by
  `latestReview()`. They share a rule but not a cache entry, so they can briefly
  disagree right after a run until both refetch. Step 19 plus the key prefix in
  step 11 keep that window short.
- **Literal glob semantics.** `dist/**`, `build/**`, `docs/**`, `e2e/**`,
  `.github/**`, `.claude/**` are root-anchored, so `client/dist/x.js` is core.
  `package.json`, `*.yaml` CI files outside `.github/`, and `next.config.mjs`
  (which is wiring via `*.config.*`) follow the spec exactly. Matching is
  case-sensitive (`readme.md` is still docs via `*.md`; `Readme` with no
  extension is core).
- **Unanchored findings** (the line is no longer in the patch after a new push)
  render at the bottom of the file body with no header, rather than being
  dropped. This is a small visual addition in an edge case. A design reviewer
  may prefer a different treatment.
- **`pr_files` is rewritten non-transactionally** by `GET /pulls/:id`
  (`pulls/routes.ts:231-242`). A concurrent smart-diff read may see a partial
  list. `buildViewGroups` puts such files into `core` instead of hiding them.
- Security: the new route is read-only and workspace-scoped through
  `getContext` + `getPull(workspaceId, prId)`, and `:id` is uuid-validated. The
  classifier does string comparisons only (no RegExp from data). Finding text
  renders through the existing `FindingCard`/`Markdown`. The security reviewer
  should confirm nothing new is exposed.
- Collapsing a group unmounts its `FileCard`s, so on re-expand each file's `open`
  state resets to the `AUTO_EXPAND_MAX_LINES` default. This is acceptable and is
  called out so nobody "fixes" it by merging the two collapse states.

**Plan follow-ups (Completion; for the coordinator, not the implementer):**
- The pipeline is planner → implementer → (architecture-reviewer ∥
  plan-verifier). The PR description must summarise which subagent did what and
  what plan-verifier found.
- Commits on branch `L03-homework` are prefixed `L03-homework: `, with separate
  `git add` / `git commit` calls. The implementer does not create commits unless
  told to.
- Candidate INSIGHTS entries at Completion (only if they held up):
  `server/INSIGHTS.md`: the smart-diff "latest review" deliberately reuses the
  PR-list rule. `client/INSIGHTS.md`: nesting `prSmartDiff` under the
  `["reviews", prId]` key prefix makes the existing invalidations cover it, but
  `refetch()` does not.

## 10. Could not determine

- **The screenshots themselves.** I only had the coordinator's text description:
  exact spacing, font sizes, the toggle's location, the dot sizes, and whether
  the group description sits on the same line as the label. The `design/` HTML
  is a bundle with no grep-able Smart Diff strings, and I did not open it in a
  browser (read-only planning).
- **Whether `SmartDiffResponse` is re-exported from `@devdigest/shared`'s
  `index.ts`** in both copies. I saw the barrel's doc comment listing
  `contracts/brief` and assume `review-api` is exported too (the client already
  imports `ReviewRecord` from `@devdigest/shared`). Step 1 has the implementer
  confirm this with grep.
- **`Button` a11y props.** I did not read `vendor/ui` `Button` to see whether it
  forwards `aria-pressed`. The plan relies on `active` plus a `role="group"`
  wrapper instead.
- **Whether `reviews.it.test.ts` can run** on the implementer's machine (Docker
  required). Without Docker, step 9's integration cases are silently skipped,
  and the implementer must say so.
