# Implementation Plan: Eval Pipeline (part 1: cases, runs, scoring; part 2: dashboards, compare, promote)

Specs (read-only input):
- Part 1: `/Users/mtakumi/Projects/dev-digest/specs/2026-10-14-eval-pipeline.md` (SPEC-2026-10-14-eval-pipeline)
- Part 2: `/Users/mtakumi/Projects/dev-digest/specs/2026-10-14-eval-dashboard.md` (SPEC-2026-10-14-eval-dashboard)

Design sources (source of truth for visuals): screenshots 2 (FindingCard button), 3 (all-agents
dashboard), 4 (per-agent dashboard), 5 (Compare modal), 6 (Evals tab), 7 (case modal), under
`/private/tmp/claude-501/-Users-mtakumi-Projects-dev-digest/c4fc28e7-efaf-45b7-bb6a-24a7a4fff00d/images/`.
Fallback: `design/DevDigest Design (standalone) (3).html` (see section 10).

Spec IDs below: `P1-AC-n` = part 1 AC, `P2-AC-n` = part 2 AC (same for E-, NFR-, Q-, D-).

---

## 1. Goal & scope

**Goal.** Turn the user's real accept/dismiss decisions into regression cases for review agents, run an
agent on all its cases with fixed inputs, score the result deterministically (recall, precision,
citation accuracy, per-case pass/fail), and give the user dashboards, a two-run Compare with a
system-prompt diff, and a roll-forward Promote of a compared configuration.

The work is split into two parts that ship and are verified in order:

- **Part 1** (`P1`, implement and verify fully first): eval-case storage extension, agent-level eval
  run entity, scoring domain, eval API, `eval_case_id` on findings, the FindingCard "Turn into eval
  case" button, the AgentEditor "Evals" tab, the eval case modal, boot-time stale-run cleanup.
- **Part 2** (`P2`, starts only after the Part 1 gate in section 12 passes): Eval Dashboard nav item,
  all-agents dashboard, per-agent dashboard (date filter, regression banner, metric cards, trend
  chart, runs table with selection), Compare modal, Promote, "Run all agents".

**Non-goals.**
- Does not change any specification. Specs are read-only input.
- No seed or test-data migrations; no data inserted by migrations. Schema changes only through
  `pnpm db:generate`.
- No mass import of decided findings (P1-Q-1), no automatic case creation.
- No skill-owned evals; the Skills "Evals" tab stays a placeholder.
- No LLM-as-judge, no fuzzy matching, no repeated sampling, no cancel of eval runs.
- No MCP tool, no CI integration for evals.
- No change in review behaviour: normal PR reviews, findings, scores and traces stay byte-identical
  (the task-line move in step 1.1 must produce identical text).
- No "Learn" or "Reply to author" buttons (visible in screenshot 2 but out of scope in P1).
- No compare of more than two runs, no cross-agent compare, no export, no notifications.
- No reordering of existing sidebar items (only the new item is appended).

## 2. Context read

Files read:
- Repo rules: `CLAUDE.md`, `server/AGENTS.md`, `client/AGENTS.md`, `reviewer-core/AGENTS.md`,
  `e2e/AGENTS.md`.
- Insights: `INSIGHTS.md`, `server/INSIGHTS.md`, `client/INSIGHTS.md`, `reviewer-core/INSIGHTS.md`.
- Server: `src/db/schema/{eval,agents,reviews,pulls}.ts`, `src/db/schema.ts`,
  `src/modules/agents/{routes,service,repository,helpers}.ts`,
  `src/modules/reviews/{routes,service,helpers,findings,run-executor,diff-loader}.ts`,
  `src/modules/reviews/repository.ts` (+ `repository/review.repo.ts`, `pull.repo.ts` excerpts),
  `src/modules/brief/ports.ts` (port pattern to copy), `src/modules/_shared/context.ts`,
  `src/modules/index.ts`, `src/app.ts`, `src/platform/{container,errors,jobs,grounding}.ts`,
  `src/adapters/git/diff-parser.ts`, `src/adapters/mocks.ts` (class list),
  `src/vendor/shared/contracts/eval-ci.ts`, `knowledge.ts` (`EvalRun`, `EvalCase`,
  `AgentVersionConfig`), `review-api.ts` (`FindingRecord`).
- reviewer-core: `src/index.ts`, `src/review/run.ts`, `src/grounding.ts`, `test/` listing.
- Client: `src/app/agents/[id]/page.tsx`, `AgentsWorkspace.tsx` (tab param),
  `AgentEditor/AgentEditor.tsx`, `AgentEditor/_components/EvalsTab/*`,
  `repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx` (+ test, usages in
  `FindingsPanel.tsx`, `DiffTab.tsx`), `src/lib/api.ts`, `src/lib/toast.tsx`,
  `src/lib/hooks/{keys,agents}.ts`, `hooks/blast.ts` (module-local type pattern),
  `src/test/render-intl.tsx`, `components/doc-preview-modal/{focus-trap.ts,DocPreviewModal.tsx}`,
  `components/app-shell/helpers.ts` (`activeKeyFor` maps `/eval` → `eval`),
  `vendor/ui/{nav.ts, kit/Modal.tsx, charts/LineChart.tsx, charts/MetricCard.tsx,
  charts/Sparkline.tsx}`, `vendor/ui/icons.tsx` (has `Gauge`, `FlaskConical`, `GitBranch`,
  `History`, `Calendar`, `TrendingUp`), `messages/en/{eval,shell}.json`, `package.json`
  (recharts ^2.15).
- Tooling: `.claude/hooks/implementer-guard.sh` (blocks `client/src/vendor/ui/`).

Relevant INSIGHTS entries (quoted):
- `INSIGHTS.md` (root): "`server/src/vendor/shared` and `client/src/vendor/shared` ... there is no sync
  script between them ... Don't overwrite one copy with the other". → This plan edits neither copy.
- `INSIGHTS.md` (root): "On this machine `pnpm` is not on `PATH` ... use `npx --yes pnpm@10 <cmd>`
  ... Postgres needs Docker Desktop running first".
- `INSIGHTS.md` (root): "Invoke best-practices skills proactively ... it needs to be checked against
  every file touched in a task".
- `server/INSIGHTS.md`: "project-context trace field is module-local: `RunTraceWithContext`
  (`project-context/schemas.ts`) extends the vendored `RunTrace` ... because `vendor/shared` is
  do-not-touch" and blast "`BlastRadius.extend` ... since `vendor/shared` is do-not-touch". → Same
  pattern for nullable eval shapes (P1-D-10, P2-D-5).
- `server/INSIGHTS.md`: "`server/tsconfig.json` has `include: ["src/**/*.ts"]`, so `pnpm typecheck`
  never type-checks `server/test/**` ... `app.ts` registers `@fastify/rate-limit` only when
  `config.nodeEnv !== 'test'` ... to assert a 429 build a dedicated app with
  `{ ...loadConfig(...), nodeEnv: 'production', logLevel: 'silent' }`. See
  `server/test/brief-rate-limit.it.test.ts`."
- `server/INSIGHTS.md`: "`*.it.test.ts` suites build `loadConfig(process.env)`, so
  `LocalSecretsProvider` reads the developer's REAL `~/.devdigest/secrets.json` ... New review-path
  LLM/GitHub calls need a test-side override for that provider". → Every eval `.it` test injects
  `ContainerOverrides.llm` for the agent's provider.
- `server/INSIGHTS.md`: "Skill 'Restore' is roll-forward, not rollback ... calls the normal
  `update({body})` so it appends a new latest version". → Promote follows this.
- `server/INSIGHTS.md`: "Adding a field to `reviewer-core`'s `ReviewOutcome` ... is silently dropped
  ... grep the destructuring". → Eval executor reads `outcome.review.findings` and
  `outcome.dropped` explicitly.
- `server/INSIGHTS.md`: "`assemblePrompt` unit tests ... live in `server/test/prompt-*.test.ts` as
  well as `reviewer-core/test/` ... Grep before changing a slot". → Relevant to step 1.1.
- `server/INSIGHTS.md`: "path-rule and duplicate violations are 400 ... a malformed body ... is 422
  from the Zod schema". → This spec explicitly asks 422 for the business-rule errors, so eval uses
  `AppError(code, msg, 422)`; documented in `server/docs/eval.md` (step 1.22).
- `client/INSIGHTS.md`: "`client/src/vendor/ui/nav.ts` was edited locally (not at the sync source)
  ... port it to the sync source or the next re-vendor will revert it. Refined 2026-10-11: a second
  local edit adds the WORKSPACE 'Project Context' item". → Third local edit (P2-Q-6, P2-D-1).
- `client/INSIGHTS.md`: "`@devdigest/ui` `ErrorState` hard-codes the English 'Retry' label ... so it
  cannot satisfy a 'every label from `messages/`' rule". → Dashboard error states use own Button +
  i18n retry label.
- `client/INSIGHTS.md`: "No Popover/Tooltip primitive exists ... (only `Modal.tsx`, `Drawer.tsx`,
  `Dropdown.tsx`)". → Tooltips are native `title` + `aria-describedby`.
- `client/INSIGHTS.md`: "`@testing-library/user-event` is NOT a client dependency ... component tests
  use the `fireEvent`-based shim `src/test/user.ts` ... and `src/test/render-intl.tsx`". → Overrides
  the generic react-testing-library rule "always userEvent": use the shim.
- `client/INSIGHTS.md`: "Testing code that calls the module-level `notify.*` ... toasts into the void
  ... Mount it one commit late". → Toast assertions in FindingCard/EvalsTab tests.
- `client/INSIGHTS.md`: "`vitest run <path>` treats its argument as a regex filter ... Filter by base
  name instead".
- `reviewer-core/INSIGHTS.md`: "this package has no committed `pnpm-lock.yaml` ... don't `git add`
  it".

## 3. Affected modules

### Part 1

**reviewer-core**
- `src/task.ts` (new): `buildTaskLine({ title, number?, author? })`.
- `src/grounding.ts` (modified): new exported `isFullFileKind(kind)` built from the existing
  `FULL_FILE_KINDS` set (no behaviour change); `buildLineIndex` already exported from the file.
- `src/index.ts` (modified): export `buildTaskLine`, `buildLineIndex`, `isFullFileKind`.
- `test/task.test.ts` (new).

**server**
- `src/db/schema/eval.ts` (modified): extend `eval_cases`, extend `eval_runs`, new
  `eval_agent_runs` table.
- `src/db/schema.ts` (modified): barrel + `schema` object include `evalAgentRuns`.
- `src/db/rows.ts` (modified, only if the file is the place row types are exported for every
  table; follow its pattern).
- `src/db/migrations/**` (generated by `pnpm db:generate`, never hand-edited).
- `src/modules/eval/` (new module):
  - `constants.ts`, `ports.ts`, `schemas.ts`, `repository.ts`, `service.ts`, `executor.ts`,
    `routes.ts`;
  - `domain/scoring.ts`, `domain/case-diff.ts`, `domain/slug.ts` (pure, with co-located
    `*.test.ts`).
- `src/modules/index.ts` (modified): register `eval`.
- `src/platform/container.ts` (modified): `eval` service getter (singleton), `evalCaseLinks` port
  getter.
- `src/app.ts` (modified): boot reaper also calls `container.eval.reapStale()`.
- `src/modules/agents/repository.ts` (modified): `deleteById` also deletes the agent's eval cases in
  one transaction (P1-E-12).
- `src/modules/reviews/ports.ts` (new): `EvalCaseLinks` port.
- `src/modules/reviews/service.ts`, `helpers.ts` (modified): `eval_case_id` on each finding DTO;
  `taskLine` delegates to `buildTaskLine`.
- `server/docs/eval.md` (new), `server/docs/README.md` (modified: index link).
- Tests (new): `src/modules/eval/domain/*.test.ts`, `server/test/eval-service.test.ts`,
  `server/test/eval-cases.it.test.ts`, `server/test/eval-from-finding.it.test.ts`,
  `server/test/eval-runs.it.test.ts`, `server/test/eval-rate-limit.it.test.ts`; modified:
  `server/test/reviews.it.test.ts` (eval_case_id); agents delete cascade covered in
  `eval-cases.it.test.ts`.

**client**
- `src/lib/hooks/keys.ts` (modified), `src/lib/hooks/eval.ts` (new: module-local types + hooks),
  `src/lib/hooks/reviews.ts` (modified only for the finding type), `src/lib/hooks/index.ts`
  (modified only if it re-exports every domain file; follow its pattern).
- `src/lib/toast.tsx` (modified): optional link action.
- `src/components/accessible-modal/` (new, promoted shared UI): `AccessibleModal.tsx`,
  `focus-trap.ts` (moved from `components/doc-preview-modal/focus-trap.ts`), `index.ts`,
  `AccessibleModal.test.tsx`; `components/doc-preview-modal/DocPreviewModal.tsx` (modified import).
- `src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/` (modified `FindingCard.tsx`,
  test) + new `FindingCard/_components/EvalCaseButton/{EvalCaseButton.tsx,index.ts,
  EvalCaseButton.test.tsx}`; callers `FindingsPanel.tsx`, `DiffTab.tsx` (pass `prId`).
- `src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` (modified: pass `agent`).
- `src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/` (rewritten `EvalsTab.tsx`,
  `EvalsTab.test.tsx`; new `helpers.ts`, `constants.ts`, `styles.ts`, `helpers.test.ts`) with nested
  `_components/`:
  - `EvalMetricCards/`, `EvalCaseRow/`, `RunAllEvalsButton/`,
  - `EvalCaseModal/` (+ `helpers.ts`, `expected-output.ts`, `constants.ts`, and its own
    `_components/DiffInput/`, `FilesList/`, `PrMetaInput/`, `ExpectedOutputEditor/`,
    `RunResultPanel/`).
- `messages/en/eval.json`, `messages/en/prReview.json` (modified: new keys).
- `src/test/render-intl.tsx` (modified: add `eval` namespace).

### Part 2

**server**
- `src/modules/eval/domain/dashboard.ts` (new, pure + test): range filter, current/delta, trend,
  recall sparkline, regression alert, compare ordering/deltas.
- `src/modules/eval/{schemas,ports,repository,service,routes}.ts` (modified): dashboard, compare,
  run-all.
- `src/modules/agents/helpers.ts` (modified): `sameAgentConfig`; `service.ts` + `routes.ts`
  (modified): promote.
- `src/platform/container.ts` (modified): `AgentConfigs` adapter for the eval module.
- Tests: `domain/dashboard.test.ts`, `server/test/eval-dashboard.it.test.ts`,
  `server/test/agents-promote.it.test.ts`, `server/test/agents-config-helpers.test.ts`.

**client**
- `src/vendor/ui/nav.ts` (local edit, **blocked** until user prerequisite U2 is confirmed).
- `src/app/eval/page.tsx` (new), `src/app/eval/[agentId]/page.tsx` (new).
- `src/app/eval/_components/` (new): `EvalDashboardView/` (+ `_components/AgentEvalCard/`,
  `RecentEvalRunsTable/`, `RunAllAgentsButton/`), `AgentEvalDashboardView/` (+ `_components/
  DashboardHeader/`, `RangeFilter/`, `RegressionBanner/`, `EvalMetricTiles/`, `MetricTrendChart/`,
  `AgentRunsTable/`, `CompareModal/` (+ `_components/PromptDiff/`, `CompareTiles/`,
  `PromoteConfirm/`)), and feature-shared `MetricBarCell/`, `SafeSparkline/`, plus
  `src/app/eval/_lib/format.ts` (percent/points/cost/date formatters used by both views).
- `src/lib/hooks/eval.ts`, `keys.ts` (modified).
- `src/components/app-shell/helpers.test.ts` (modified: per-agent path active key).
- `messages/en/eval.json` (modified).
- e2e: one new flow under `e2e/specs_old/` for nav (see step 2.16).

## 4. Contracts touched

No vendored contract is edited (`*/vendor/shared/**` untouched). All new or nullable shapes are
module-local: Zod in `server/src/modules/eval/schemas.ts` (server, authoritative) and TypeScript types
in `client/src/lib/hooks/eval.ts` (client mirror). This follows P1-D-10 / P2-D-5 and the existing
`blast/schemas.ts` / `hooks/blast.ts` pattern. `server/docs/eval.md` records the re-vendor flag
(P1 "Architecture note").

### 4.1 DB schema (all via `pnpm db:generate`; explicit snake_case names)

`eval_cases` (existing, extended; currently unused and empty):
- `source_finding_id uuid NULL` FK → `findings.id` ON DELETE SET NULL (P1-E-3).
- `source_pr_id uuid NULL` FK → `pull_requests.id` ON DELETE SET NULL (P1-E-3).
- `origin text NOT NULL DEFAULT 'manual'`, enum `finding | manual` (R2, P1-Q-3).
- `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.
- Existing columns reused: `input_diff` (case diff text), `input_meta` (`{ title, body }`),
  `expected_output` (item array), `notes`, `owner_kind`/`owner_id` (owner = agent, P1-D-2).
  `input_files` stays unused (Files tab is derived from the diff, P1-Q-4).
- Indexes: `(workspace_id, owner_kind, owner_id, created_at)`; unique
  `(owner_kind, owner_id, source_finding_id)` (default NULLS DISTINCT, so manual and orphaned cases
  are unaffected; enforces P1-AC-5 / P1-D-8 under races); index on `source_finding_id` (FK) and
  `source_pr_id` (FK).

`eval_agent_runs` (new; agent-level run, P1-D-3):
- `id uuid PK defaultRandom`, `workspace_id` FK workspaces ON DELETE CASCADE, `agent_id` FK
  agents ON DELETE CASCADE (P1-E-12).
- Snapshot: `agent_version int NOT NULL`, `provider text NOT NULL`, `model text NOT NULL`,
  `strategy text NOT NULL`, `system_prompt text NOT NULL`, `skill_ids jsonb NOT NULL DEFAULT '[]'`.
- `status text NOT NULL` enum `running | done | partial | failed`, `reason text NULL`.
- `started_at timestamptz NOT NULL DEFAULT now()`, `finished_at timestamptz NULL`.
- Counters `cases_total`, `cases_executed`, `cases_errored`, `cases_passed` int NOT NULL DEFAULT 0.
- `recall`, `precision`, `citation_accuracy` double precision NULL; `cost_usd` double precision NULL;
  `duration_ms` int NULL. (Cost follows the repo's existing `double precision` cost columns, e.g.
  `agent_runs.cost_usd`, not `numeric`.)
- Indexes: `(agent_id, started_at)`, `(workspace_id, started_at)`; partial unique index on
  `(agent_id) WHERE status = 'running'` (DB guard for one active run per agent, P1-AC-17 race).

`eval_runs` (existing per-case store, extended):
- `eval_agent_run_id uuid NULL` FK → `eval_agent_runs.id` ON DELETE CASCADE (null for single-case
  runs).
- `status text NOT NULL DEFAULT 'running'` enum `running | passed | failed | error` (answer to
  question 3).
- `finished_at timestamptz NULL`, `error_reason text NULL`.
- Counts (int NULL): `expected_count` (must_find items), `got_count` (grounded findings),
  `kept_count`, `dropped_count`, `must_find_total`, `must_find_matched`, `positive_findings`,
  `negative_findings` (see 4.3).
- Existing `actual_output` = grounded findings JSON; `pass`, `recall`, `precision`,
  `citation_accuracy`, `duration_ms`, `cost_usd` filled per case.
- Indexes: `(case_id, ran_at)`, `(eval_agent_run_id)`; partial unique `(case_id) WHERE
  status = 'running' AND eval_agent_run_id IS NULL` (single-case `409`). Agent-level runs insert
  per-case rows only when the case finishes, so they never hold a `running` per-case row.

### 4.2 API (server Zod in `eval/schemas.ts`; client mirror types in `hooks/eval.ts`)

Error bodies use the repo envelope `{ error: { code, message, details } }` (gap resolved in round 1):
`409` carries `details.case_id` / `details.eval_run_id` / `details.result_id`.

Part 1 shapes:
- `ExpectedItem` (strict, unknown keys rejected): `expect` (`must_find | must_not_flag`, default
  `must_find`), `file` (relative path: non-empty, ≤ 1000 chars, not starting with `/`, no `..`
  segment, no Windows drive form), `start_line` (int ≥ 1), `end_line?` (int ≥ `start_line`),
  `severity?` (`CRITICAL | WARNING | SUGGESTION`), `category?` (string ≤ 64), `title?` (string
  ≤ 300). `ExpectedOutput` = array ≤ 200 items (empty allowed).
- `CaseMeta`: `{ title: string ≤ 500, body: string ≤ 20000 }`.
- `EvalCaseBody` (POST/PUT, strict): `name` (trimmed 1..120), `input_diff` (string, non-empty; length
  cap enforced by the service so the code is `diff_too_large`), `input_meta: CaseMeta`,
  `expected_output: ExpectedOutput`, `notes?: string ≤ 2000 | null`.
- `EvalCaseResult`: `id, case_id, eval_run_id|null, status, ran_at, finished_at|null,
  expected_count, got_count|null, kept_count|null, dropped_count|null, duration_ms|null,
  cost_usd|null, error_reason|null`.
- `EvalCase` (GET one): `id, agent_id, name, origin, input_diff, input_meta, expected_output, notes,
  source_finding_id|null, source_pr_id|null, created_at, updated_at, latest_result|null`.
- `EvalCaseSummary` (list item) = `EvalCase` without `input_diff`.
- `EvalAgentRun`: `id, agent_id, agent_version, provider, model, strategy, skill_ids, status,
  reason|null, started_at, finished_at|null, cases_total, cases_executed, cases_errored,
  cases_passed, recall|null, precision|null, citation_accuracy|null, cost_usd|null,
  duration_ms|null`. `EvalAgentRunDetail` adds `system_prompt`.
- Endpoints:

| Method, path | Body / query | Success | Errors (code) |
|---|---|---|---|
| `POST /findings/:id/eval-case` | none | `201 EvalCase` | `404 not_found`, `409 eval_case_exists {case_id}`, `422 undecided \| diff_unavailable \| range_outside_diff \| agent_missing` |
| `GET /pulls/:id/reviews` (existing) | | each finding gains `eval_case_id: string \| null` | unchanged |
| `GET /agents/:id/eval-cases` | | `200 EvalCaseSummary[]` newest first | `404` |
| `POST /agents/:id/eval-cases` | `EvalCaseBody` | `201 EvalCase` (`origin: manual`) | `404`, `422 validation_error \| diff_unparsable \| diff_too_large \| expectation_outside_diff` |
| `GET /eval-cases/:id` | | `200 EvalCase` | `404` |
| `PUT /eval-cases/:id` | `EvalCaseBody` | `200 EvalCase` (source links and origin kept) | `404`, `422` as above |
| `DELETE /eval-cases/:id` | | `200 { ok: true }` | `404` |
| `POST /eval-cases/:id/run` | none | `202 { result_id }` | `404`, `409 eval_case_running {result_id}` |
| `POST /agents/:id/eval-runs` | none | `202 { eval_run_id, status: "running", cases_total }` | `404`, `409 eval_run_active {eval_run_id}`, `422 no_cases` |
| `GET /eval-runs/:id` | | `200 { run: EvalAgentRunDetail, progress: { done, total }, cases: (EvalCaseResult & { case_name: string \| null })[] }` | `404` |
| `GET /agents/:id/eval-runs` | `?since=<ISO datetime>` optional | `200 EvalAgentRun[]` newest first | `404`, `422` bad `since` |

Part 2 shapes:
- `GET /eval/dashboard` → `{ agents: AgentEvalCard[], recent_runs: RecentEvalRun[] }`:
  - `AgentEvalCard`: `id, name, provider, model, enabled, cases_total, has_running_run, last_run: {
    id, agent_version, started_at, cases_passed, cases_executed } | null` (latest finished),
    `recall_trend: number[]` (≤ 10 latest finished, chronological, nulls dropped),
    `latest: { recall, precision, citation_accuracy }` (each nullable). Only agents with ≥ 1 case
    (P2-Q-5).
  - `RecentEvalRun`: `id, agent_id, agent_name, agent_version, started_at, recall, precision,
    citation_accuracy, cases_passed, cases_executed` (20 latest finished runs across agents).
- `GET /agents/:id/eval-dashboard?range=7d|30d|90d|all` (default `30d`) → `{ agent: { id, name,
  provider, model, version, enabled }, cases_total, runs_in_range, current, delta, trend, runs,
  alert }`:
  - `current`: `{ run_id, agent_version, recall, precision, citation_accuracy, cases_passed,
    cases_executed, cost_usd } | null` (latest finished in range).
  - `delta`: `{ recall, precision, citation_accuracy }` each `number | null` (fraction, current −
    previous finished in range; null when either side null) or `null` when < 2 finished.
  - `trend`: `{ run_id, started_at, recall, precision, citation_accuracy }[]` (finished runs in
    range, chronological, nullable values).
  - `runs`: every run in range, newest first (`EvalAgentRun`).
  - `alert`: `{ version, dropped: { metric, points }[], rose: metric[], held: metric[] } | null`
    (`metric` ∈ `recall | precision | citation_accuracy`; `points` = whole points, rounded).
- `GET /eval-runs/compare?a=<uuid>&b=<uuid>` → `{ a: CompareSide, b: CompareSide, deltas: { recall,
  precision, citation_accuracy, cost_usd } (nullable), prompt_a, prompt_b, cases_total }`;
  `CompareSide`: `id, agent_version, started_at, recall, precision, citation_accuracy, cost_usd,
  is_current_config: boolean, version_available: boolean`. Server always returns `a` = older
  `started_at`. Errors: `404` (missing or foreign run), `422 compare_cross_agent |
  compare_not_finished | validation_error`.
- `POST /agents/:id/promote` body `{ version: int ≥ 1 }` (strict) → `200 { agent: Agent, version }`;
  errors `404 not_found` (agent), `404 version_missing`, `409 identical`.
- `POST /eval-runs/all` → `202 { started: { agent_id, eval_run_id }[], skipped: { agent_id, reason:
  "no_cases" | "already_running" | "disabled" | "error" }[] }`.

### 4.3 Scoring definitions (domain, P1-AC-21..23, P1-E-6..E-10)

- Match: exact `file` equality and inclusive overlap `f.start ≤ i.end && i.start ≤ f.end`;
  missing `end_line` = `start_line`. Grounded findings only (`outcome.review.findings`).
- Per case: `must_find_total`, `must_find_matched` (items matched by ≥ 1 grounded finding);
  `positive_findings` = grounded findings matching ≥ 1 `must_find` item; `negative_findings` =
  grounded findings that are not positive and match ≥ 1 `must_not_flag` item, plus every grounded
  finding of an empty-array case. Unlabelled findings are excluded.
- Pass (P1-AC-22): all `must_find` matched, no grounded finding matches a `must_not_flag` item, and
  empty-array case ⇒ zero grounded findings.
- Run aggregate over executed (non-error) cases: recall = Σmatched / Σmust_find_total; precision =
  Σpositive / (Σpositive + Σnegative); citation = Σkept / (Σkept + Σdropped); denominator 0 ⇒
  `null`. Cost = Σ executed case costs, `null` if any executed case cost is null (errored cases
  excluded, like metrics; open question N-2). Duration = wall time start → end.
- Run status: no executed cases errored ⇒ `done`; some ⇒ `partial`; all ⇒ `failed` with all metrics
  `null`.

## 5. Skills for implementer

| Skill | Governs steps / files | Key rules for this task |
|---|---|---|
| onion-architecture | 1.5–1.13, 2.2–2.7 (`server/src/modules/eval/**`, container, agents, reviews) | `service.ts`, `executor.ts`, `ports.ts`, `domain/**` import no fastify/drizzle/zod/SDK; services take narrow ports via a deps object (copy `brief/ports.ts` + container getter), never `Container`; repository returns mapped DTO/domain types, never `$inferSelect` rows; cross-module needs go through ports wired in `platform/container.ts`, never another module's repository/helpers. `domain/` is justified (real scoring rules). |
| fastify-best-practices | 1.10, 2.5, 2.7 routes | Route = parse (Zod `params/body/querystring/response`) → one service call → status code; per-route `config.rateLimit` and `bodyLimit`; errors thrown as `AppError` and mapped by the global handler; no SQL or branching rules in routes. |
| zod | 1.4, 2.1 (`eval/schemas.ts`), client `expected-output.ts` | `.strict()` on request bodies and expected items (unknown keys rejected); `z.coerce`/enum for query params (`range`, `since`); export schema + `z.infer` type together; refinements with `path` (end ≥ start, path rules); `safeParse` on the client for the JSON editor; never trust `JSON.parse` output. |
| drizzle-orm-patterns | 1.3, 1.7, 1.12, 2.3 | Explicit snake_case column names; FK via arrow functions with explicit `onDelete`; multi-step writes (`deleteById` + cases, run finalisation) in `db.transaction`; `t.*` and `drizzle-orm` imports only in `repository.ts`; migrations only via `pnpm db:generate`. |
| postgresql-table-design | 1.3 | `timestamptz`, `text` + enum check, NOT NULL with defaults, index every FK column, partial unique indexes for "one running", no `serial`, no `varchar(n)`. |
| react-frontend-architecture | 1.14–1.21, 2.8–2.14 | Pages thin; feature UI in PascalCase folders with lowercase `helpers.ts`/`constants.ts`/`styles.ts`/`index.ts`; nested `_components/`; data only via `src/lib/hooks/eval.ts` → `api.ts`; strings from `messages/`; shared UI in `src/components/<kebab>/` only when ≥ 2 consumers (focus-trap promotion); no new big barrels. |
| react-best-practices | same client steps | Derive, don't store (metrics, labels, validity, selection hints computed during render); `useEffect` only for polling/Esc/focus sync; components ≤ ~200 lines (split the modal); helpers outside component bodies; URL state for the date range. |
| next-best-practices | 2.11, 2.12 (`src/app/eval/**/page.tsx`) | `"use client"` only where needed (existing pages already use `useParams` client pages); `useSearchParams` for `range` with `router.replace`; dynamic route `[agentId]`. |
| react-testing-library | all client tests | Behaviour flows, 1–3 tests per component, `getByRole`/`getByLabelText` first; **use `src/test/user.ts` shim, not userEvent** (client/INSIGHTS); mock `fetch`/hooks at the boundary; no snapshots. |
| typescript-expert | 1.1, 1.4, 2.1 client mirror types | Client types mirror server Zod output exactly (snake_case, `| null` vs optional); discriminated status unions; no `any`. |
| security | 1.8, 1.10, 2.4, 2.5, 2.7, client rendering steps | Workspace scoping on every query (NFR-4/NFR-3: foreign id ⇒ 404); rate limits; body limit; path validation on expected items; untrusted diff/PR text/finding text rendered as plain text (no `Markdown`, no `dangerouslySetInnerHTML`); logs never include diff, PR body, prompt or finding text (P1-NFR-5, P2-NFR-5). |

## 6. Architecture constraints

- Layering (server): `routes.ts` → `service.ts` / `executor.ts` → `ports.ts` ← `repository.ts`;
  `domain/` pure. Composition only in `platform/container.ts` and `app.ts`.
- Cross-module access:
  - reviews → eval: only via `reviews/ports.ts` `EvalCaseLinks`, implemented by the eval repository
    and wired in the container.
  - eval → agents: only via an eval port (`AgentSource` in P1, `AgentConfigs` in P2) implemented in
    the container with `container.agentsRepo` and `agents/helpers.ts` (`sameAgentConfig`).
  - agents → eval tables: `AgentsRepository.deleteById` deletes `eval_cases` rows by table import from
    `db/schema` inside its transaction (table-level cascade emulation, since `owner_id` is
    polymorphic with no FK). This is the one accepted table-level reach; document it in a code
    comment and in `server/docs/eval.md`.
  - eval repository reads `findings`, `reviews`, `pull_requests`, `pr_files`, `agents` tables
    (read-only, workspace-scoped), as `brief/repository.ts` already does for its sources.
- Background execution: fire-and-forget like `ReviewService.runReview` (`void ...catch(log)`), not
  `JobRunner` (its 120 s timeout and retries do not fit long runs).
- Naming: server kebab-case files; client PascalCase component folders with lowercase siblings;
  tests co-located with the same base name (server integration tests live in `server/test/` as the
  existing suites do; pure-domain unit tests are co-located in `modules/eval/domain/`).
- Do-not-touch that applies: `server/src/vendor/shared/**`, `client/src/vendor/shared/**` (no
  edits), `client/src/vendor/ui/**` (no edits except the single sanctioned `nav.ts` item in step
  2.9, gated by U2), `server/src/db/migrations/**` (generated only), every `pnpm-lock.yaml` (no
  dependency changes are planned; recharts is already a dependency).
- `.claude/hooks/**`: nobody in this plan edits the hook or bypasses it via Bash/Python. The nav.ts
  step waits for the user (U2).
- Design: screenshots are the source of truth; no new visuals except where the spec or an accepted
  answer requires one (manual tag uses the existing row label chip style; disabled/hint states use
  existing Button props).

## 7. Steps

Owners: **I** = implementer, **T** = test-writer, **C** = check-runner, **U** = user.
Lanes: **S** = server lane, **W** = web/client lane. Steps marked `∥` within a part may run in
parallel lanes after that part's contract step.

### User prerequisites (before implementation)

- **U1** (U): Docker Desktop running and Postgres up (`docker compose up -d` in the repo root);
  `npx --yes pnpm@10 db:migrate` succeeds on the current HEAD.
- **U2** (U, needed only before step 2.9): add an exception in `.claude/hooks/implementer-guard.sh`
  that allows editing exactly `client/src/vendor/ui/nav.ts`, then confirm to the coordinator. Step
  2.9 stays **blocked** until this confirmation. No agent edits the hook.
- **U3** (U, needed for step 1.24 and P1-AC-26): a configured provider API key for the agent under
  test, and decided findings: ≥ 3 accepted and ≥ 3 dismissed; missing `must_not_flag` cases are
  topped up manually in the case modal (tag "manual").

### Part 1

**1.1** (I, serial, skill: typescript-expert) reviewer-core task line and grounding exports.
- New `reviewer-core/src/task.ts`: `buildTaskLine({ title, number?, author? })`. With `number` and
  `author` the output must be byte-identical to today's `server/src/modules/reviews/helpers.ts`
  `taskLine(pull)`; without them, the same text without `#<number>` and ` by <author>`
  (e.g. `Review pull request "<title>". Report only ...`).
- `grounding.ts`: add exported `isFullFileKind(kind?: string)` using the existing
  `FULL_FILE_KINDS`; keep `groundFindings` behaviour identical.
- `index.ts`: export `buildTaskLine`, `buildLineIndex`, `isFullFileKind`.

**1.2** (I, serial) Server review task line delegates.
- `server/src/modules/reviews/helpers.ts` `taskLine(pull)` returns `buildTaskLine({ title:
  pull.title, number: pull.number, author: pull.author })`. No other change. The existing
  `server/test/reviews-helpers.test.ts` must pass unchanged (byte-identity proof).

**1.3** (I, serial, skills: drizzle-orm-patterns, postgresql-table-design) DB schema.
- Edit `server/src/db/schema/eval.ts` per 4.1 (import `findings` from `./reviews`, `agents` from
  `./agents`; reuse `now()` from `./_shared` for timestamps).
- Add `evalAgentRuns` to the `server/src/db/schema.ts` barrel import and `schema` object; add row
  types to `src/db/rows.ts` only if that file lists every table's row type.
- Run `cd server && npx --yes pnpm@10 db:generate` then `npx --yes pnpm@10 db:migrate`. Inspect the
  generated SQL (do not edit it): no data statements, partial indexes present.

**1.4** (I, serial; contract freeze for both lanes, skills: zod, typescript-expert)
- `server/src/modules/eval/schemas.ts`: all part-1 Zod schemas and inferred types from 4.2; error
  codes as constants in `eval/constants.ts`.
- `client/src/lib/hooks/eval.ts`: the matching TypeScript types only (no hooks yet), plus
  `EvalAwareFinding = FindingRecord & { eval_case_id?: string | null }`.
- After this step lanes S and W run in parallel.

**1.5** ∥S (I, skill: onion-architecture) `eval/constants.ts`, `eval/ports.ts`.
- Constants: `NAME_MAX=120`, `NOTES_MAX=2000`, `DIFF_MAX_CHARS=1_000_000`,
  `CASE_BODY_LIMIT_BYTES=4 * 1024 * 1024`, `SLUG_MAX=60`, `RATE_LIMIT={max:10,timeWindow:'1 minute'}`,
  reason strings (`interrupted`, `agent_deleted`, `missing_api_key`, `case_deleted`), error codes.
- Ports (plain TS, type-only imports from `@devdigest/shared`): `EvalCaseStore`, `EvalRunStore`,
  `FindingSource` (`findingForCase(workspaceId, findingId)` → finding fields, decision timestamps,
  review agent id, agent-exists flag, PR id/title/body, the file's `patch | null`),
  `AgentSource` (`get(workspaceId, agentId)` → id, name, enabled, version, provider, model,
  strategy, systemPrompt; `enabledSkillIds(agentId)`; `list(workspaceId)`),
  `ReviewEngine` (`(input) => Promise<{ kept: Finding[]; dropped: number; costUsd: number | null }>`),
  `DiffParser`, `LineIndexer`, `TaskLineBuilder`, `LlmResolver`, `EvalLog`, and `EvalDeps` (incl.
  `now()`).

**1.6** ∥S (I, skill: onion-architecture; tests in 1.6T) Pure domain.
- `domain/slug.ts`: kebab-case slug of a title, ASCII, collapse separators, trim dashes, max 60
  (cut at a dash boundary when possible), fallback `case` for an empty slug.
- `domain/case-diff.ts`: `buildFileDiff(path, patch)` (prepend `diff --git a/p b/p`, `--- a/p`,
  `+++ b/p` like `diffFromPrFiles`); `rangeTouchesNewLines(lineIndex, file, start, end)`;
  `firstExpectationOutsideDiff(items, lineIndex)` → index of the first `must_find` item outside the
  diff, or `null` (P1-AC-11).
- `domain/scoring.ts`: `matches(finding, item)`, `scoreCase(items, kept, droppedCount)` → per-case
  counts + `pass` (4.3), `aggregateRun(caseResults)` → metrics/status/cost, `expectedCount(items)`.
- **1.6T** (T): `slug.test.ts`, `case-diff.test.ts`, `scoring.test.ts` with the tables from
  P1-AC-21 (touching edges match, off-by-one no match, different path no match), P1-AC-22 (pass/fail
  per case type), P1-AC-23 fixture with exact values including a `null`, P1-E-6, E-7, E-8, E-9,
  E-10, and the must_find-precedence rule (open question N-1).

**1.7** ∥S (I, skills: drizzle-orm-patterns, onion-architecture) `eval/repository.ts`.
- Implements `EvalCaseStore`, `EvalRunStore`, `FindingSource`, and `EvalCaseLinks`
  (`caseIdsForFindings(workspaceId, findingIds)` → `Map`). Every query filters by `workspace_id`
  (cases, agent runs) or joins to a workspace-scoped parent (per-case results via case).
- Mappers to the 4.2 shapes (ISO strings, nulls). Latest result per case via one query
  (`DISTINCT ON (case_id)` ordered by `ran_at desc`) for the list (no N+1).
- Unique violations on the partial indexes are translated to typed results (`'active_exists'`,
  `'case_running'`, `'case_exists'`) so the service maps them to `409` without catching driver
  errors in the service.
- Run finalisation (counters + metrics + status) in one transaction.

**1.8** ∥S (I, skills: onion-architecture, security) `eval/service.ts` (`EvalService`).
- `createFromFinding(ws, findingId)`: `404` if missing/foreign; `422 undecided` if neither
  timestamp; `422 agent_missing` if the review has no agent or the agent is gone; `409
  eval_case_exists` if a case for (agent, finding) exists; `422 diff_unavailable` if patch null;
  build file diff, parse, `422 range_outside_diff` unless `isFullFileKind` (file present suffices)
  or the range touches new-side lines; insert with `origin: 'finding'`, name = slug, meta = PR
  title/body at click time, source links, one expectation item (`must_find` if accepted, else
  `must_not_flag`) with file/start/end + severity, category, title labels.
- `createCase(ws, agentId, body)` / `updateCase(ws, caseId, body)`: agent `404`; `422
  diff_too_large` (> `DIFF_MAX_CHARS`); parse diff, `422 diff_unparsable` if 0 files; `422
  expectation_outside_diff {index}`; update keeps `origin` and `source_*` links; bumps `updated_at`.
- `getCase`, `listCases` (newest first), `deleteCase`.
- `startCaseRun(ws, caseId, log)`: insert a `running` result (`409` on conflict), then
  fire-and-forget `executor.runSingle`.
- `startAgentRun(ws, agentId, log)`: `404`; `409 eval_run_active` (pre-check + DB guard); `422
  no_cases`; snapshot agent version/provider/model/strategy/system prompt + enabled skill ids
  (link enabled AND skill enabled, same rule as `selectPromptSkills`); insert run with
  `cases_total`; return `{ eval_run_id, status: 'running', cases_total }` immediately;
  fire-and-forget `executor.runAgentRun`. Must answer within 500 ms for 200 cases (one count query,
  one insert).
- `getRun`, `listRuns(ws, agentId, since?)`.
- `reapStale()`: runs `running` → `failed` reason `interrupted` (+ `finished_at`); per-case
  `running` → `error` reason `interrupted`. Returns counts.

**1.9** ∥S (I, skills: onion-architecture, security) `eval/executor.ts`.
- `runCase(snapshot, case, llm)`: parse the case diff; call `ReviewEngine` with only `systemPrompt`,
  `model`, `diff`, `llm`, `strategy`, `task: buildTaskLine({ title: meta.title })`,
  `prDescription: meta.body` when non-empty, `sessionId: eval:<runId|resultId>:<caseId>`. No
  skills, memory, specs, callers, repoMap, intent (P1-AC-16). Score with `scoreCase`.
- `runAgentRun(runId)`: resolve the LLM once; on `ConfigError` mark every case `error` reason
  `missing_api_key` and the run `failed` reason `missing_api_key` (P1-E-13), with no LLM calls.
  Otherwise loop cases in creation order, one at a time (P1-NFR-1): before each case check the run
  row still exists (if not: stop, log `reason=agent_deleted`, P1-E-12); a missing case ⇒ `error`
  `case_deleted`; any thrown error ⇒ `error` with a short reason (`err.message` truncated to 200
  chars, never diff/prompt text), continue (P1-AC-19). Insert each per-case row when the case
  finishes and update run counters (progress `done = executed + errored`). Finalise with
  `aggregateRun`.
- `runSingle(resultId)`: same `runCase` with the agent's current version; update the result row.
- Logs (P1-NFR-5): exactly one start line and one end line per agent-level run with run id, agent id,
  version, cases total, executed, errored, status, duration, cost; no content.
- The engine adapter lives in the container (step 1.11), not here: it wraps `reviewPullRequest` and
  returns `review.findings`, `dropped.length`, `costUsd`.

**1.10** ∥S (I, skills: fastify-best-practices, zod, security) `eval/routes.ts`.
- All part-1 endpoints of 4.2 with Zod `params`/`body`/`querystring`/`response` schemas; `IdParams`
  from `_shared/schemas.ts`; `getContext` for the workspace.
- `config.rateLimit = { max: 10, timeWindow: '1 minute' }` on `POST /findings/:id/eval-case`,
  `POST /eval-cases/:id/run`, `POST /agents/:id/eval-runs` (P1-NFR-3).
- `bodyLimit: CASE_BODY_LIMIT_BYTES` on `POST /agents/:id/eval-cases` and `PUT /eval-cases/:id` so a
  1,000,000-char diff reaches the `diff_too_large` check instead of a `413`.
- Status codes: 201 create, 202 runs, 200 others. Routes call `app.container.eval`.

**1.11** ∥S (I, skill: onion-architecture) Composition.
- `platform/container.ts`: `get eval(): EvalService` singleton built with `EvalDeps` (repository,
  `AgentSource` adapter over `this.agentsRepo`, engine adapter over `reviewPullRequest`,
  `parseUnifiedDiff`, `buildLineIndex`, `buildTaskLine`, `llm: (p) => this.llm(p)`);
  `get evalCaseLinks(): EvalCaseLinks`.
- `modules/index.ts`: register `eval` routes.
- `app.ts`: after `reapStaleRuns`, call `container.eval.reapStale()` in its own try/catch and log
  counts (P1-AC-20).
- No new external dependency, so no `adapters/mocks.ts` change.

**1.12** ∥S (I, skill: drizzle-orm-patterns) `agents/repository.ts` `deleteById`: in one
transaction delete `eval_cases` where `owner_kind='agent' AND owner_id=id AND workspace_id=ws`, then
the agent (agent-level eval runs cascade by FK; per-case results cascade via case). Update the doc
comment.

**1.13** ∥S (I, skill: onion-architecture) reviews `eval_case_id`.
- New `reviews/ports.ts` with `EvalCaseLinks`.
- `ReviewService` gets the port from `container.evalCaseLinks`; `reviewsForPull` collects all finding
  ids, makes one lookup, passes the map into `reviewToDto`; `ReviewDtoFinding` gains
  `eval_case_id: string | null` (module-local DTO; vendored `FindingRecord` untouched).
- `findingRowToDto` used by accept/dismiss responses returns `eval_case_id: null`; acceptable because
  the client refetches the reviews query after actions (comment it).

**1.14** ∥W (I, skills: react-frontend-architecture, typescript-expert) Hooks.
- `keys.ts`: `evalCases(agentId)`, `evalCase(id)`, `agentEvalRuns(agentId)`, `evalRun(id)`.
- `hooks/eval.ts`: `useEvalCases`, `useEvalCase(id)` (2 s `refetchInterval` while
  `latest_result.status === 'running'`), `useCreateEvalCase`, `useUpdateEvalCase`,
  `useDeleteEvalCase`, `useRunEvalCase`, `useAgentEvalRuns`, `useEvalRun(id)` (2 s while
  `running`), `useStartEvalRun`, `useCreateCaseFromFinding(prId)` (invalidates
  `queryKeys.reviews(prId)` on 201 and 409). When a run finishes, invalidate `evalCases(agentId)` and
  `agentEvalRuns(agentId)` (P1-AC-18 refresh ≤ 5 s).
- `hooks/reviews.ts`: findings typed as `EvalAwareFinding` (type-only change).

**1.15** ∥W (I, skill: react-best-practices) `lib/toast.tsx`: add an optional `{ href, label }` link
to `success`/`error`/`toast` (and `notify.*`), rendered as an anchor inside the toast; existing call
sites unchanged.

**1.16** ∥W (I, skill: react-frontend-architecture) Shared accessible modal (R4).
- Move `components/doc-preview-modal/focus-trap.ts` to `components/accessible-modal/focus-trap.ts`;
  add `AccessibleModal` (wraps vendored `Modal`, adds focus trap, Esc to close, focus return to the
  opener, `aria-labelledby` to the title); `index.ts`. Update `DocPreviewModal` to use it (behaviour
  unchanged; its tests must still pass).

**1.17** ∥W (I) Messages and test helper.
- `messages/en/prReview.json` `finding.evalCase.*`: button "Turn into eval case", "In eval set",
  hint "Accept or dismiss this finding first", success toast + link label (agent's Evals tab), error
  messages per code (`diff_unavailable`, `range_outside_diff`, `agent_missing`, `undecided`,
  network).
- `messages/en/eval.json`: reuse existing keys where they match (P1-NFR-7); add: TRACES PASSED label,
  "x / y passing", "View full dashboard →", "Run all evals", "Running… {done}/{total}", empty-metrics
  hint "Run all evals to get metrics", "expected {n} finding(s), got {m}", "must not flag",
  "empty []", "manual", "no data", "up"/"down" screen-reader words, row aria labels ("Run {name}",
  "Edit {name}", "Delete {name}"), delete confirm, "Files" tab and list headers, "Finding skeleton",
  "Run on save", "Cancel", modal subtitle "{agent} · simulate a PR and assert the expected output",
  validation reasons (name required, invalid JSON, contract error, no file in diff, diff too large,
  expectation outside diff), result panel texts (passed/failed line, running, error), "No API key
  for {provider}", run status texts (partial, failed + reasons).
- `src/test/render-intl.tsx`: add the `eval` namespace.

**1.18** ∥W (I, skills: react-frontend-architecture, react-best-practices, security) FindingCard.
- New `FindingCard/_components/EvalCaseButton/` (`EvalCaseButton.tsx`, `index.ts`): props
  `finding: EvalAwareFinding`, `prId`. States: undecided ⇒ disabled + `title` + `aria-describedby`
  hint (P1-AC-2); `eval_case_id` set or just created ⇒ disabled "In eval set" (P1-AC-4/5); pending
  ⇒ loading. Click ⇒ mutation; 201 ⇒ success toast with link `/agents/<agent_id>?tab=evals`; 409 ⇒
  no error toast, state flips via refetch; 422/network ⇒ error toast with the coded reason. Icon
  `FlaskConical`, `kind="ghost" size="sm"` like Dismiss (screenshot 2).
- `FindingCard.tsx`: accept `prId` (optional) and render `EvalCaseButton` after Dismiss, before
  Translate (P1-AC-1). Update both callers (`FindingsPanel.tsx`, `DiffTab.tsx`) to pass `prId`.

**1.19** ∥W (I, skills: react-frontend-architecture, react-best-practices) Evals tab (screenshot 6).
- `AgentEditor.tsx`: render `<EvalsTab agent={agent} />`.
- `EvalsTab.tsx` composes:
  - section header "EVAL METRICS" + "View full dashboard →" link to `/eval/<agentId>`;
  - `EvalMetricCards`: RECALL/PRECISION/CITATION ACCURACY/TRACES PASSED from the latest finished
    run, delta in whole points vs the previous finished run with ▲/▼ + hidden "up"/"down" text,
    "—" with `aria-label="no data"` for null, empty hint when no finished run (P1-AC-24/25);
  - "Eval cases" heading + "x / y passing" badge;
  - `RunAllEvalsButton`: "Running… k/N" and disabled while a run is active (active run discovered
    from `useAgentEvalRuns`, progress from `useEvalRun`); 409/422 toasts; a failed run with
    `missing_api_key` shows "No API key for <provider>";
  - "New eval case";
  - list of `EvalCaseRow`: status icon + text, name with ellipsis + `title`, "expected N finding(s),
    got M" or "never run", label chip (first must_find "SEVERITY · category", omitting absent parts;
    no chip when both are absent, answer 6; "must not flag"; "empty []"), a "manual" chip for
    `origin='manual'`, icon buttons Run/Edit/Delete with case-name aria labels, delete via confirm.
  - Empty state text `evalsTab.emptyCases` (P1-E-1); the list scrolls (P1-E-16).
- `helpers.ts`: `rowLabel`, `rowStatus`, `passingBadge`, `latestTwoFinished`, `deltaPoints`,
  `formatPct`. `constants.ts`: poll interval.

**1.20** ∥W (I, skills: react-frontend-architecture, react-best-practices, zod, security) Case modal
(screenshot 7) `EvalCaseModal/`.
- Built on `AccessibleModal`; title "Eval case · {name}" or "New eval case"; subtitle with agent
  name. Left: Name (required), Input tabs Diff (monospace textarea, plain text) / Files (read-only
  list path + `+a −d` derived from the diff, P1-Q-4) / PR meta (title + body inputs). Right:
  "Expected output" + valid/invalid JSON badge, "Finding skeleton" inserts `{ severity, category,
  title, file, start_line }` into the array (pre-filled with the first diff file and its first added
  line when available), JSON textarea, result panel. Footer: "Run on save" toggle (default on),
  Cancel, "Run case", Save.
- `expected-output.ts`: client Zod mirror of `ExpectedOutput` used with `safeParse` for the badge and
  reasons; `helpers.ts`: `parseDiffFiles(raw)` (files with additions/deletions; ≥ 1 file required),
  `validateCaseForm` → per-field reasons. Save and Run case disabled while any reason exists
  (P1-AC-10). Server 422 codes shown next to the matching field.
- Save ⇒ create/update; when "Run on save" is on ⇒ `useRunEvalCase` after success (P1-AC-12).
  "Run case" on an unsaved form saves first, then runs (the server runs stored inputs).
- Result panel (P1-AC-13): running state while polling; "Last run passed/failed · expected N
  finding(s), got M · 1.8s · $0.02" (cost "—" when null); error with reason.
- Split into the nested `_components/` listed in section 3 so no component exceeds ~200 lines.

**1.21** ∥W (I) Row "Run": `useRunEvalCase` from the row; the row shows running, then the new status
(list refetch every 2 s while any row's latest result is running).

**1.22** (I, after lane S) Docs: `server/docs/eval.md` (module layout, ports, scoring definitions from
4.3, status codes and why business-rule errors are 422 here, nullable metric shapes as a module-local
extension with a "re-vendor `EvalRun` / `EvalDashboard` nullable metrics at the sync source" flag,
the agents → eval_cases delete reach, fire-and-forget execution and the boot reaper). Link it from
`server/docs/README.md`.

**1.23** (T) Part 1 tests (server set ∥ client set).
- Server unit: `server/test/eval-service.test.ts` with in-memory fake ports (create-from-finding
  branches, AC-10/11 validation, start-run 409/422, missing key path, agent_deleted stop,
  aggregation hand-off).
- Server integration (inject `ContainerOverrides.llm` for the agent's provider with a stub
  `LLMProvider`; never real keys):
  - `eval-from-finding.it.test.ts`: accepted ⇒ `must_find`, dismissed ⇒ `must_not_flag`, diff and PR
    meta stored, slug name; second create ⇒ `409` + count unchanged; `range_outside_diff`;
    `diff_unavailable`; `agent_missing` (agent deleted); undecided ⇒ `422`; foreign workspace ⇒
    `404`; `GET /pulls/:id/reviews` shows `eval_case_id`.
  - `eval-cases.it.test.ts`: create/update persist; update keeps source links; `422` for unparsable
    diff, `diff_too_large` (1,000,001 chars, proves the body limit), `expectation_outside_diff`,
    unknown key, `..` path; delete removes case + results and leaves an earlier run's metrics
    identical (P1-AC-14); deleting the agent deletes its cases and runs.
  - `eval-runs.it.test.ts`: `202` body + recorded snapshot; captured prompt contains case diff + PR
    meta and no repo-map / intent / project-context / skills sections (P1-AC-16); stub failing on 1
    of 3 ⇒ `partial` with metrics over 2 (P1-AC-19); all fail ⇒ `failed` + null metrics; `409`
    active, `422 no_cases`, `404`; single-case run stores a result and no agent-level run
    (P1-AC-13) and `409` while running; stale `running` rows are failed/errored by `reapStale` on a
    fresh `buildApp` (P1-AC-20). Wait for completion by polling `GET /eval-runs/:id` in a bounded
    loop, not fixed sleeps.
  - `eval-rate-limit.it.test.ts`: dedicated app with `nodeEnv: 'production', logLevel: 'silent'`;
    11th call ⇒ `429` on the three limited routes.
- reviewer-core `test/task.test.ts`: with number+author equals the old literal text; without them
  equals the expected eval text.
- Client (`renderWithIntl`, `src/test/user.ts`, fetch/hook mocks):
  - `EvalCaseButton.test.tsx`: disabled + hint for undecided; click ⇒ toast with link and "In eval
    set"; `eval_case_id` ⇒ "In eval set"; 422 ⇒ error toast (mount-late harness per INSIGHTS).
  - `FindingCard.test.tsx`: button present in the expanded action row after Dismiss.
  - `EvalsTab.test.tsx`: rows, labels (manual, empty [], must not flag, no chip), status icons +
    text, "x / y passing"; metric cards values, ▲/▼ deltas, "—"/"no data", empty hint; running
    progress "Running… k/N" with disabled button.
  - `EvalCaseModal.test.tsx`: new vs edit modes, tabs, invalid JSON badge disables Save, finding
    skeleton insert, run-on-save triggers a run after save, result panel text, Esc closes and returns
    focus.
  - `helpers.test.ts` for EvalsTab and modal helpers; `AccessibleModal.test.tsx`; `DocPreviewModal`
    tests still green.

**1.24** (C, then manual) Checks and browser verification (section 8, Part 1). Then the manual
P1-AC-26 experiment (U3 data required); record versions and the observed precision drop for the PR
description.

**Part 1 gate**: architecture-reviewer ∥ plan-verifier on Part 1. Part 2 does not start until both
pass and section 8 Part 1 is green.

### Part 2

**2.1** (I, serial; contract freeze) Part-2 Zod schemas in `eval/schemas.ts` (`RangeQuery` enum with
default `30d`, `CompareQuery` with two uuids, `PromoteBody` strict, dashboard/compare/run-all
responses) and the matching client types in `hooks/eval.ts`.

**2.2** ∥S (I, skill: onion-architecture; tests in 2.2T) `eval/domain/dashboard.ts`.
- `rangeStart(range, now)`; `finishedRuns(runs)` (`done|partial`); `currentAndDelta(runs)`;
  `trend(runs)`; `recallSparkline(runs, 10)`; `regressionAlert(latest, previous)`: drop ≥ 1 point
  inclusive using integer math on rounded basis points (0.9 points ⇒ no banner, exactly 1.0 ⇒
  banner), null on either side excluded, < 2 finished ⇒ `null`; returns `{ version,
  dropped[{metric, points}], rose[], held[] }`; `orderPair(a, b)` by `started_at`;
  `compareDeltas`.
- **2.2T** (T): tests for P2-AC-6/7/8/11, P2-E-1, E-2, E-3, E-7, E-11.

**2.3** ∥S (I, skill: drizzle-orm-patterns) Repository additions: runs of an agent since a date
(newest first); per-agent latest finished run + last 10 finished recall values + case counts + any
running run for all agents with ≥ 1 case (a small fixed number of queries, P2-NFR-1 ≤ 500 ms); 20
latest finished runs across agents joined to agent names; two runs by id (workspace-scoped) with
prompts.

**2.4** ∥S (I, skills: onion-architecture, security) Service methods.
- `dashboard(ws)`, `agentDashboard(ws, agentId, range)` (`404` if agent missing/foreign; P2-E-5),
  `compare(ws, a, b)` (`404` missing/foreign; `422 compare_cross_agent`, `422
  compare_not_finished`; `is_current_config` + `version_available` from the `AgentConfigs` port),
  `runAll(ws, log)`: for each workspace agent: disabled ⇒ `disabled`; no cases ⇒ `no_cases`;
  active ⇒ `already_running`; else `startAgentRun`, any thrown error ⇒ `error`; one log line with
  started/skipped counts (P2-NFR-5).

**2.5** ∥S (I, skills: fastify-best-practices, onion-architecture, security) Promote in agents.
- `agents/helpers.ts`: `sameAgentConfig(versionConfig, agentRow)` comparing provider, model,
  system_prompt, output_schema (deep equality, null-safe), strategy, ci_fail_on, repo_intel (not
  skills, not name/description).
- `agents/service.ts`: `promote(ws, agentId, version)`: agent `404`; `getVersion` missing ⇒
  `AppError('version_missing', ..., 404)`; `sameAgentConfig` ⇒ `AppError('identical', ..., 409)`;
  else `repo.update` with the seven fields (bumps version, snapshots; skill links unchanged); one log
  line `{ agentId, sourceVersion, newVersion }` (no prompt text). Returns `{ agent, version }`.
- `agents/routes.ts`: `POST /agents/:id/promote` with `IdParams` + strict body; rate limit 10/min.

**2.6** ∥S (I) Container: `AgentConfigs` adapter for eval (`isCurrentConfig(agentId, version)` →
`{ available, current }` using `agentsRepo.getVersion`, `getById`, `sameAgentConfig`).

**2.7** ∥S (I, skills: fastify-best-practices, zod) Routes: `GET /eval/dashboard`,
`GET /agents/:id/eval-dashboard` (querystring `RangeQuery`, invalid ⇒ 422), `GET /eval-runs/compare`
(static path; uuid-validated `a`/`b`), `POST /eval-runs/all` (rate limit 10/min, R6).

**2.8** ∥W (I) Hooks + keys: `evalDashboard()`, `agentEvalDashboard(agentId, range)`,
`evalCompare(a, b)`; `useEvalDashboard` (2 s refetch while any agent `has_running_run`),
`useAgentEvalDashboard` (2 s while any run in range is running), `useEvalCompare` (enabled only with
two ids; a `422` surfaces as an error the caller toasts), `usePromoteAgent` (invalidates agent,
agents, agent dashboard, compare), `useRunAllAgents`.

**2.9** ∥W (I) **BLOCKED until U2 is confirmed.** `client/src/vendor/ui/nav.ts`: append to SKILLS
LAB `{ key: "eval", label: "Eval Dashboard", icon: "Gauge", href: "/eval" }` as the last item; no
other change. Extend `components/app-shell/helpers.test.ts` to assert `/eval` and `/eval/<id>` map to
`eval`. If U2 is not confirmed when the lane reaches this step, skip it, finish the rest, and report
it as open. Never edit or bypass the hook.

**2.10** ∥W (I, skill: react-frontend-architecture) Feature-shared pieces under
`src/app/eval/_components/`: `MetricBarCell` (bar + "82%" or "—"/"no data"), `SafeSparkline`
(wraps vendored `Sparkline`; 0 points ⇒ nothing, 1 point ⇒ duplicate the value so no NaN, P2-E-1);
`src/app/eval/_lib/format.ts` (`pct`, `points`, `usd`, `fmtDateTime` as `YYYY-MM-DD HH:mm`).

**2.11** ∥W (I, skills: next-best-practices, react-frontend-architecture) All-agents dashboard
(screenshot 3).
- `src/app/eval/page.tsx` (thin) → `EvalDashboardView`: breadcrumb "Skills Lab › Eval Dashboard";
  title, subtitle (P2-AC-2); `RunAllAgentsButton` (toast "Started N · skipped M" or "Nothing to run ·
  skipped M"; disabled "Running…" while any agent has a running run, from server data, R5); AGENTS
  list of `AgentEvalCard` (icon, name + model chip, "Last run vN · date · x/y pass" or "Never run",
  recall sparkline, RECALL/PREC/CITE or "—", chevron; the card is a link to `/eval/<id>`; long names
  truncated with `title`); "RECENT EVAL RUNS · ALL AGENTS" table (P2-AC-3). Empty state "No eval
  cases yet" + link to `/agents`; error state with own retry button (P2-AC-17).

**2.12** ∥W (I, skills: next-best-practices, react-best-practices, security) Per-agent dashboard
(screenshot 4).
- `src/app/eval/[agentId]/page.tsx` → `AgentEvalDashboardView`; breadcrumb "Skills Lab › Eval
  Dashboard › <agent>"; "All agents" back link; header name + model chip; subtitle worded as in the
  screenshot ("Regression harness · {n} runs on the {m}-trace gold set", answer 2); agent switcher
  (Dropdown with the agents of P2-AC-2, navigates); `RangeFilter` (7 days / 30 days / 90 days / All
  time, default 30 days, persisted in `?range=` via `router.replace`, P2-AC-6); "Run eval" (409/422
  toasts).
- `RegressionBanner` (`role="status"`, text from i18n templates filled from `alert`, the dropped part
  bold, P2-AC-11).
- `EvalMetricTiles`: vendored `MetricCard` with the delta as a decimal with ↑/↓ exactly as screenshot
  4 (answer 1) + visually hidden "up"/"down" text; null ⇒ value "—" with `aria-label="no data"` and
  no delta; trend array cleaned of nulls and passed only when it has ≥ 2 points (MetricCard renders
  its own Sparkline, which breaks on 1 point).
- `MetricTrendChart`: own recharts `LineChart` (not the vendored one, which maps null to 0) with
  three series and a legend, y domain `[min(0.6, lowest value floored to 0.1), 1.0]`, null points
  left as gaps (never zero), chronological; a visually hidden text summary of the latest values
  (P2-NFR-4).
- `AgentRunsTable`: columns per screenshot; a checkbox per finished run with accessible name "Select
  run vN <date>"; `running` rows "Running… k/N", not selectable; `failed` rows "failed" with reason
  in `title`, not selectable; `partial` tag; cost "$0.00" or "—"; first 50 + "Show more" (P2-E-9);
  header "<k> selected"; a third selection is blocked with hint "Compare takes exactly two runs";
  "Compare" enabled only with exactly two (P2-AC-9/10).
- Empty states: "No runs in this range" + "Run eval"; cards "—" when no finished run; "Agent not
  found" + link to `/eval` on 404 (P2-E-5); error + retry.

**2.13** ∥W (I, skills: react-frontend-architecture, security) Compare modal (screenshot 5).
- `CompareModal` on `AccessibleModal` (focus returns to "Compare"): title "Compare runs · vA → vB",
  subtitle as in the screenshot ("Old prompt vs new — metric deltas and prompt diff on the {m}-trace
  gold set", answer 2); `CompareTiles` RECALL/PRECISION/CITATION/COST "A → B" with "▲ 4pt" /
  "▲ 0.02" deltas and hidden up/down text; "—" and no delta for null. The modal opens only after a
  successful compare fetch; `422` ⇒ error toast, no modal (P2-AC-14).
- `PromptDiff`: pure line-level diff (LCS) in `CompareModal/helpers.ts`; removed lines styled old,
  added new, unchanged plain; each changed line has a visually hidden "removed:"/"added:" prefix;
  identical prompts ⇒ "System prompts are identical"; block max-height 50vh with scroll (P2-E-8);
  plain text only.
- Promote (P2-Q-1 beats P2-D-3). Candidates = sides with `is_current_config === false` and
  `version_available === true`.
  - 2 candidates ⇒ two buttons "Promote vA" and "Promote vB".
  - 1 candidate ⇒ one button for it.
  - 0 candidates ⇒ one disabled "Promote vB" with hint "v<B> is already the current configuration"
    (P2-AC-16); if B's snapshot is missing the server answers `404 version_missing` anyway.
  - `PromoteConfirm` (confirm step in the modal footer) ⇒ `usePromoteAgent` ⇒ close + toast
    "Promoted v<X> as v<N+1>"; `404 version_missing` / `409 identical` ⇒ error toast, agent
    unchanged.

**2.14** ∥W (I) Messages in `eval.json` for every part-2 label (reuse existing `dashboard.*` keys
where they match, P2-NFR-6).

**2.15** (T) Part 2 tests.
- Server: `domain/dashboard.test.ts` (2.2T); `eval-dashboard.it.test.ts` (dashboard shapes, range
  filter, compare 422 cross-agent / not finished, 404 foreign, order by start time, run-all mixed
  eligibility started/skipped lists); `agents-promote.it.test.ts` (version +1 and config equals the
  version B snapshot, skill links unchanged, `404 version_missing` leaves the agent untouched, `409
  identical`); `agents-config-helpers.test.ts` (`sameAgentConfig`).
- Client: `EvalDashboardView.test.tsx` (cards incl. never-run and null, recent runs order, run-all
  toast + disabled state, empty + error states); `AgentEvalDashboardView.test.tsx` (header, switcher
  navigation, range in URL, banner variants, cards null handling); `AgentRunsTable.test.tsx` (row
  variants per status, 0/1/2 selection, third blocked); `MetricTrendChart` helper test (series with
  a null and a value below 0.6); `CompareModal.test.tsx` (tiles incl. null, diff changed vs
  identical, promote button variants, confirm + toast, Esc returns focus); `PromptDiff` helper test;
  `helpers.test.ts` for `activeKeyFor`.

**2.16** (T) e2e: one deterministic flow in `e2e/specs_old/` (read `e2e/README.md` and
`e2e/INSIGHTS.md` first): click "Eval Dashboard" in the sidebar ⇒ URL `/eval`, heading "Eval
Dashboard" visible, item active (P2-AC-1). Asserts only on read-only state (the hermetic stack has
no cases ⇒ empty state text). Requires step 2.9.

**2.17** (C, then manual) Checks and browser verification (section 8, Part 2).

**2.18** (I, completion) INSIGHTS: refine the existing `client/INSIGHTS.md` nav.ts entry (third local
edit: SKILLS LAB "Eval Dashboard", `key: "eval"`, icon `Gauge`; port to the sync source) per P2-Q-6;
record anything else non-obvious learned (engineering-insights rules).

**Final gate**: architecture-reviewer ∥ plan-verifier on the whole change.

## 8. Acceptance checks

All commands run from the package directory; `pnpm` via `npx --yes pnpm@10` (root INSIGHTS).

### Part 1
- reviewer-core: `cd reviewer-core && npm run typecheck && npm test`.
- server:
  - `cd server && npx --yes pnpm@10 db:generate` produced exactly one new migration (review the SQL,
    no hand edits), then `npx --yes pnpm@10 db:migrate`.
  - `npx --yes pnpm@10 typecheck && npx --yes pnpm@10 test` (unit + integration; Docker up).
  - `npx --yes pnpm@10 exec vitest run eval reviews agents` three times (flaky-race note in
    server/INSIGHTS) and confirm green.
  - `server/test/reviews-helpers.test.ts` unchanged and passing (task-line byte identity).
- client: `cd client && npx --yes pnpm@10 typecheck && npx --yes pnpm@10 test && npx --yes pnpm@10 lint`.
- Guard checks:
  - `git diff --stat -- server/src/vendor/shared client/src/vendor/shared client/src/vendor/ui` is
    empty.
  - `git diff --stat -- '*/pnpm-lock.yaml'` is empty; no new `reviewer-core/pnpm-lock.yaml` staged.
  - `git diff -- server/src/db/migrations` contains only drizzle-kit output.
- Browser (dev stack running, against the user's real data):
  1. PR detail: an expanded finding shows "Turn into eval case" after Accept/Dismiss; undecided ⇒
     disabled with hint; decided ⇒ success toast with a working link to Agents › Evals, button
     becomes "In eval set"; reload keeps "In eval set".
  2. Evals tab matches screenshot 6: metric cards (or "—" + hint before any run), "x / y passing",
     rows with icons/labels, Run/Edit/Delete.
  3. Modal matches screenshot 7: tabs, Files list, PR meta, valid/invalid JSON badge, Finding
     skeleton, Run on save, Run case ⇒ result panel; Esc closes and focus returns.
  4. "Run all evals" ⇒ "Running… k/N" ⇒ metrics refresh within 5 s of finishing.
  5. With the provider key temporarily removed ⇒ run `failed`, "No API key for <provider>".
  6. Restart the API during a run ⇒ run shows `failed` (interrupted), and a new run can start.
  7. P1-AC-26 experiment: three runs (baseline, edited prompt, "flag every changed line" prompt);
     note versions and the precision drop for the PR description.

### Part 2
- server and client: the same typecheck/test/lint commands as Part 1.
- e2e: `cd e2e && npm run typecheck && npm run e2e:hermetic` (never `docker compose down -v`).
- Browser:
  1. Sidebar shows "Eval Dashboard" last in SKILLS LAB, active on `/eval` and `/eval/<id>`;
     breadcrumbs as specified.
  2. `/eval` matches screenshot 3 (cards, sparkline, recent runs); "Run all agents" toast and
     disabled "Running…".
  3. `/eval/<id>` matches screenshot 4: switcher, range filter (`?range=` survives reload), banner
     after a deliberate precision drop, cards with ↑/↓ decimals, trend chart with gaps for null,
     runs table selection rules.
  4. Compare matches screenshot 5: tiles, prompt diff ("identical" for same-version runs), Promote
     with confirm ⇒ toast "Promoted vX as vN+1"; the agent editor shows the new version and the
     promoted prompt; a following review uses it.

## 9. Risks & open questions

Open questions (non-blocking; default implemented, confirm in review):
- **N-1** Scoring precedence: a grounded finding that matches both a `must_find` and a
  `must_not_flag` item (possible only in hand-written cases). AC-23 read literally counts it in the
  numerator and again in the "matched must_not_flag" term. Default: count it once, as positive
  (4.3); the case still fails per AC-22. Isolated in one function of `scoring.ts`.
- **N-2** Cost of errored cases: AC-23 says "null if any case cost is unknown". Default: errored
  cases are excluded from cost, like from metrics.

Risks for reviewers to scrutinise:
- architecture-reviewer: `AgentsRepository.deleteById` deleting `eval_cases` (table-level reach,
  section 6); `ReviewService` receiving a port from the container while still constructed with
  `Container` (legacy style, unchanged); the eval repository reading other modules' tables; `domain/`
  purity; container getters; no JobRunner.
- security reviewer: `bodyLimit` 4 MiB on two routes (memory per request vs the 1,000,000-char
  requirement); expected-item path rules; workspace scoping of `eval_runs` through the parent case;
  rate limits on four POST routes + promote; log content (no diff/prompt/finding text); untrusted
  text rendered as plain text in rows, modal, prompt diff, toasts.
- Task-line move (step 1.1): any whitespace difference changes production prompts; guarded by the
  existing test.
- Model non-determinism (P1-Q-6): two runs of one version can differ; AC-26 needs a visible drop.
- Long runs: 100 cases × up to ~60 s each; the fire-and-forget promise lives in the API process; a
  restart is handled by the reaper (`interrupted`).
- Vendored `MetricCard` has no null semantics; the wrapper must pass a string value and omit `delta`
  for null.
- e2e for P1-AC-18 ("progress then final metrics") is replaced by the manual browser check: e2e flows
  must use read-only seeded data and no LLM (`e2e/AGENTS.md`), and the user excluded seed data.
- Step 2.9 depends on U2; Part 2 can otherwise complete, but P2-AC-1 stays open until U2.

## 10. Could not determine

- `design/DevDigest Design (standalone) (3).html`: text search found no eval strings (likely an
  encoded bundle). UI states not covered by screenshots (manual chip, error/empty states, Files tab
  list, confirm steps, range options) reuse existing primitives and chip styles; the implementer
  should open the HTML in a browser before steps 1.19 and 2.11 and align if it shows any of them.
- Exact `src/db/rows.ts` and `src/lib/hooks/index.ts` conventions were not read; steps 1.3/1.14 say
  "follow its pattern".
- `server/test/helpers/pg.ts` and `helpers/runs.ts` APIs were not read; the test-writer reads them
  before 1.23.
- `e2e/README.md`, `e2e/INSIGHTS.md` and existing flows were not read; required reading for 2.16.
- Whether the Agents list cards (left column of screenshot 6) should show eval data: not in either
  spec; unchanged.

## 11. Requirements review

Questions asked and answers received (quoted from the coordinator relaying the user):
- Spec open questions and defaults: "ACCEPT ALL open questions [NEEDS CLARIFICATION] in both specs
  with the agent's proposals (part 1 Q-1..Q-6, part 2 Q-1..Q-6)" and "Also accept all 'Assumed
  defaults' D-* in both specs." Scope: "Full scope for the case modal and dashboards (including Run
  all agents and date filter)." Data: "No migrations with seed/test data. Schema changes only via
  pnpm db:generate."
- Round-1 questions 1–3, 5, 6: "ALL your defaults accepted (card delta format as screenshot 4 with
  hidden up/down text for screen readers, Evals tab and Compare keep the '▲ 4pt' format; subtitles
  worded as in screenshots; single-case status `running` with 2s polling and stale-running cleanup on
  boot; missing must_not_flag cases topped up manually with tag 'manual'; no severity label when
  absent)."
- Round-1 question 4 (nav.ts vs hook): "user chose 'allow an exception in the hook'. The user will
  handle the hook change themselves; the plan must NOT have anyone edit the hook or bypass it via
  Bash." → U2 + step 2.9 blocked.
- Conflict P2-Q-1 vs P2-D-3: "Q-1 beats D-3 for Promote, as you proposed."

Gaps/conflicts found (and how the plan resolves them):
- P2-D-3 vs P2-Q-1 (promote direction): Q-1 wins (step 2.13).
- P1-E-12 vs FK cascade: the run row is deleted with the agent; the executor stops and logs
  `agent_deleted` (step 1.9). `eval_cases.owner_id` has no FK: explicit delete in `deleteById`
  (step 1.12).
- 409 bodies vs repo error envelope: `details.*` (4.2).
- 1,000,000-char diff vs the 1 MiB global `bodyLimit`: per-route limit (step 1.10).
- Vendored `LineChart` (null ⇒ 0), `Sparkline` (1 point ⇒ NaN), `Modal` (no focus trap / Esc),
  `MetricCard` (no null semantics): local chart, wrappers, `AccessibleModal` (steps 1.16, 2.10,
  2.12).
- Toast has no link: extend `lib/toast.tsx` (step 1.15).
- `JobRunner` timeout unsuitable: fire-and-forget + reaper (steps 1.8, 1.11).
- `pr_files.patch` has no file header: `buildFileDiff` (step 1.6).
- `eval_case_id` needs a cross-module read: `EvalCaseLinks` port (step 1.13).
- Missing API key (P1-E-13): resolve once, `missing_api_key` (step 1.9).
- P1-AC-18 e2e conflicts with e2e read-only/no-LLM rules: replaced by a browser check (section 9).
- `renderWithIntl` lacks `eval`: step 1.17.
- Spec metric-card format (points ▲/▼) vs screenshot 4 (decimal ↑/↓): screenshot 4 (answer 1).
- Spec subtitle wording vs screenshots: screenshots (answer 2).
- Single-case lifecycle needs `running`: added (answer 3, 4.1).

Recommendations and decisions:
- R1 eval module modelled on `brief`, with a pure `domain/`: **accepted** (steps 1.5–1.11).
- R2 `origin` column for the manual tag: **accepted** (4.1, step 1.19).
- R3 `buildTaskLine` in reviewer-core, byte-identical for reviews: **accepted** (steps 1.1, 1.2).
- R4 promote `useFocusTrap` into a shared `AccessibleModal`: **accepted** (step 1.16).
- R5 "Run all agents" state from server data: **accepted** (step 2.11).
- R6 rate limit on `POST /eval-runs/all`: **accepted** (step 2.7).
- R7 strict phasing, Part 1 verified before Part 2: **accepted** (gates in section 7, section 12).

## 12. Execution mode

**multi-agent**. The coordinator relayed: "Execution mode: MULTI-AGENT (implementer -> test-writer ->
check-runner -> architecture-reviewer || plan-verifier; part 1 fully verified before part 2)."

Sequence per part:
1. implementer: serial steps (Part 1: 1.1–1.4; Part 2: 2.1), then two parallel lanes:
   - lane S (server): Part 1 1.5–1.13, then 1.22; Part 2 2.2–2.7.
   - lane W (client): Part 1 1.14–1.21; Part 2 2.8–2.14 (2.9 waits for U2).
2. test-writer: Part 1 1.6T + 1.23 (server and client sets can run in parallel lanes); Part 2 2.2T +
   2.15 + 2.16.
3. check-runner: section 8 commands for the part (1.24 / 2.17), including the guard checks; browser
   checks are done by the coordinator or the user against the dev stack.
4. architecture-reviewer ∥ plan-verifier: Part 1 gate, then the final gate after Part 2.
5. implementer: 2.18 INSIGHTS at completion.

Part 2 starts only when the Part 1 gate passes.
