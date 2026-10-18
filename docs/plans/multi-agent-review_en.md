# Implementation Plan: Multi-Agent Review

Spec: `specs/2026-10-16-multi-agent-review.md` (SPEC-2026-10-16-multi-agent-review).
Status: **final** - all round-1 questions (Q-1 to Q-10) and the execution mode were
answered by the user on 2026-10-17 (section 11). No step is blocked.

## 1. Goal & scope

Let a reviewer pick 2-8 agents for one PR, from the PR page picker or the
`/multi-agent-review/configure` screen. The agents run in parallel (at most 4 at a
time) under one `multi_agent_runs` parent. The results page has `Columns` and
`Tabs + detail` modes, groups findings across agents and shows a "Where agents
disagree" block. Users can cancel one agent or the whole run and retry one failed
agent. Each run's grounding-drop list is persisted and shown in `RunTraceDrawer`.

**Non-goals**
- Does not change any specification. The spec is read-only input; spec defects are
  listed in section 11, not fixed.
- No change to `POST /pulls/:id/review` request/response or to single-agent
  execution semantics. The single-agent path gets only additive or safe changes:
  - a `grounding_dropped` trace field;
  - `queued` awareness in reaper, cancel and polling;
  - the trace-before-status reorder (R7).
  The PR page dropdown UI is replaced by the picker (Q-7); with 1 agent checked, the
  picker still calls the unchanged single-agent endpoint.
- No change to `agent-runner/` (other team) and no `ci/` directory.
- No change to `reviewer-core/`: it already returns `outcome.dropped` with reasons.
- No edit of either `*/vendor/shared/**` copy (Q-1). Contracts are extended
  module-locally.
- No `Learn` / `Reply to author` (hidden, AC-33). No configurable similarity
  threshold.
- No fix of the pre-existing missing workspace check on `GET /runs/:id/trace` (or
  `POST /runs/:id/cancel`). It is only noted (section 9).
- No sidebar items other than "Multi-Agent Review". The GLOBAL group in the
  screenshots also shows Memory / Agent Performance / CI Runs; those pages do not
  exist and are not added.
- No benchmark automation. NFR-1 is a manual run by the user (Q-9).

## 2. Context read

Files read:
- Spec (full), `CLAUDE.md`, `server/AGENTS.md`, `client/AGENTS.md`,
  `reviewer-core/AGENTS.md`, `INSIGHTS.md` (root), `server/INSIGHTS.md`,
  `client/INSIGHTS.md`.
- Server:
  - `modules/reviews/{run-executor.ts, service.ts, routes.ts, repository/run.repo.ts}`
  - `modules/brief/routes.ts` (module template)
  - `modules/agents/{helpers.ts (buildAgentStats: avg_duration_ms, avg_cost_usd, runs_30d), repository.ts}`
  - `db/schema/runs.ts`, `db/schema/reviews.ts`
  - `platform/{container.ts, sse.ts, run-logger.ts}`, `app.ts`
  - vendored `contracts/observability.ts` (both copies; the multi-agent block is identical)
  - vendored `contracts/trace.ts` (`RunSummary`), `platform.ts` (`RunRequest`), `findings.ts` (`confidence` 0..1)
  - `reviewer-core/src/grounding.ts` + `review/run.ts` (grep: `dropped` with reasons)
- Client:
  - `lib/hooks/{reviews.ts, trace.ts, agents.ts}`, `lib/repo-context.tsx` (active repo = URL > localStorage > first)
  - `vendor/ui/{nav.ts, shell/Sidebar.tsx, kit/Dropdown.tsx, icons.tsx}`
  - `components/app-shell/helpers.ts` (`activeKeyFor` already maps `/multi-agent` to `multi-agent`)
  - `messages/en/{runs.json, shell.json}`
  - PR page `_components/{RunReviewDropdown, RunTraceDrawer, FindingCard}` (full) and `RunHistory`, `PrDetailHeader` (grep)
- Design screenshots (source of truth, read as images):
  - S1 `/var/folders/xf/0xzlz5zj103_q_0d167mk8fh0000gn/T/emdash-drop-fb27d9c8-f728-4d4d-8c65-a0ed8bee085b-image.png`
    (PR #482 page, Run Review picker open)
  - S2 `…/emdash-drop-ea5ea634-27d0-447c-9bcc-aa4a04224140-image.png` (Configure run, no PR)
  - S3 `…/emdash-drop-a0fbb135-3e5e-4828-9944-20142abef5a9-image.png` (Configure run, PR selected, 5 cards)
  - S4 `…/emdash-drop-f60cc128-824c-438c-b93c-9a189cb344f6-image.png` (Results, Columns)
  - S5 `…/emdash-drop-3bfe5d26-16f4-431a-b8b8-c3fca1857513-image.png` (Results, Tabs + detail)
  (all under `/var/folders/xf/0xzlz5zj103_q_0d167mk8fh0000gn/T/`)
- `design/DevDigest Design (standalone) (4).html` (grep only). This is the fallback
  where no screenshot covers an element. Artboards: `ma-cols`, `ma-tabs`
  (`ScreenMultiAgent`), `e-ma` ("Multi-Agent · no agents"). No picker/configure
  artboards exist, which is why S1-S3 matter.

What the screenshots show (summary for the implementer; open the PNGs while building):
- **S1 picker**: popover under "Run Review".
  - Header "PICK AGENTS TO RUN" on the left, a "Clear" link on the right.
  - Rows: checkbox, `Cpu` icon, agent name, muted estimate on the right.
  - Full-width primary button "Run multi-agent review (2)" with a users icon.
  - Divider, then a muted "Configure agents…" row with a settings icon.
  - Header actions: View on GitHub, Run Review (dropdown trigger), Compose review.
- **S2 configure, no PR**:
  - Breadcrumb "Multi-Agent Review > Configure run".
  - Title "Run a Multi-Agent Review" and a subtitle.
  - Numbered step 1 "Pull request" with a "Select a pull request…" dropdown button.
  - Step 2 "Agents to run" is dimmed: a dashed box with a PR icon, "Pick a pull
    request first" and a body line.
  - "Run multi-agent review (4)" button.
- **S3 configure, PR selected**:
  - Step 1 shows `#482 · <title>`. Step 2 header has a "Select all" link on the right.
  - Agent cards: checkbox, colored icon tile, name, one-line summary, estimate
    `8.2s · $0.06` top right. A selected card has a border tinted with the agent
    color; an unselected card is neutral.
  - Run button followed by muted mono text `≈ 8.2s · $0.20 · parallel fan-out`.
- **S4 columns**:
  - Header: "Configure run" secondary button, title "Multi-Agent Review", muted
    "4 selected agents · parallel", Columns|Tabs segmented toggle on the right.
  - Second row: `#482` + PR title on the left; on the right
    "4 agents · fan-out via worktrees · 8.2s total · $0.20". AC-26 replaces
    "fan-out via worktrees" with "parallel fan-out".
  - Columns: top border in the agent color, icon tile, name, `8.2s · $0.06`, score
    ring. Finding cards: severity icon, title, mono `file:line`, left border in the
    severity color. Footer: "View trace" on the left, "N findings" on the right.
  - "WHERE AGENTS DISAGREE" heading plus a "Show only conflicts" switch. One card
    per location: `<> file:line` + title, then one cell per agent (agent name,
    severity dot + label or "did not flag", note line).
- **S5 tabs**:
  - Tab bar: icon + agent name + colored score.
  - Summary card: score ring, colored agent name, summary, and on the right
    "View trace" and `8.2s · $0.06`.
  - Expandable finding cards: severity icon, title, category tag, `file:line`,
    `98% conf`, description, "SUGGESTED FIX" block, actions row.
  - The screenshot shows 5 actions. AC-33 keeps only Accept, Dismiss and Turn into
    eval case.
  - The same disagreement block follows.
- **Screenshot vs spec, resolved in favour of the spec**:
  - "fan-out via worktrees" becomes "parallel fan-out" (AC-26).
  - Learn and Reply to author are hidden (AC-33).
  - "did not flag" cells show no reason text (AC-24, Q-6 of the spec).
  - The Architecture cell for an agent that was not selected is not shown (AC-24,
    Q-7 of the spec).

Relevant insights (quoted):
- `server/INSIGHTS.md` Recurring Errors 2026-10-12: "`run-executor.ts` commits
  `agent_runs.status = done|failed` (`completeAgentRun`) BEFORE `saveRunTrace` …
  `GET /runs/:id/trace` can run in the gap … Fix is to wait for the trace row too
  (or save the trace before the status flip)."
- `server/INSIGHTS.md` Recurring Errors 2026-09-18: "`run-executor.ts`
  destructures the outcome by name right before persistence, so a new field is
  silently dropped". This matters for AC-32 (`outcome.dropped`).
- `server/INSIGHTS.md` Codebase Patterns 2026-10-11: "`RunTraceWithContext` …
  extends the vendored `RunTrace` … because `vendor/shared` is do-not-touch, and it
  is safe because the trace is stored as raw jsonb with no response schema."
- `server/INSIGHTS.md` Tool & Library Notes 2026-10-12: "`pnpm typecheck` never
  type-checks `server/test/**`" and "`@fastify/rate-limit` only when
  `config.nodeEnv !== 'test'` … to assert a 429 build a dedicated app with
  `nodeEnv: 'production', logLevel: 'silent'`."
- `server/INSIGHTS.md` 2026-10-16: a zod body that tolerates no body needs
  `.nullish()`.
- `server/INSIGHTS.md` 2026-09-24: new review-path LLM calls in `.it` suites need a
  test-side provider override (incl. `openrouter` intent) or they hit real keys.
- Root `INSIGHTS.md` 2026-09-18 / 2026-09-25: no sync script between the vendored
  copies; `implementer-guard.sh` blocks Edit/Write on `*/vendor/shared/**`.
  This is why Q-1 chose module-local types.
- `client/INSIGHTS.md`:
  - `nav.ts` "was edited locally (not at the sync source)" three times; Q-5 adds a
    fourth by the same pattern.
  - "No Popover/Tooltip primitive exists"; `Dropdown.tsx` is "click+outside-click
    only".
  - The vendored `Tabs` renders plain `<button>`s.
  - `ToastProvider` always mounts `role="status"`.
  - `@testing-library/user-event` is absent (use `src/test/user.ts`).
  - `vitest run <path>` with `[number]` brackets matches nothing (filter by base
    name).
  - The EvalCaseModal cross-route import is the precedent for importing
    `RunTraceDrawer` / `FindingCard` from the PR route.
- Root `INSIGHTS.md` 2026-09-18: `pnpm` is not on PATH here, so use
  `npx --yes pnpm@10`.

## 3. Affected modules

server
- `src/db/schema/runs.ts` (modified): `agentRuns.multiAgentRunId`,
  `multiAgentRuns.requestedAgentIds`, `multiAgentRuns.cancelledAt`, indexes.
- `src/db/migrations/**` (new, generated only by `pnpm db:generate`).
- `src/modules/multi-agent-run/` (new module; name per spec NFR-6):
  - `routes.ts`, `service.ts`, `repository.ts`, `ports.ts`
  - `schemas.ts` (the module-local contract extension, Q-1)
  - `constants.ts`
  - `domain/grouping.ts` + `domain/grouping.test.ts`
  - `domain/run-status.ts` + `domain/run-status.test.ts`
- `src/modules/index.ts` (modified): register the new routes plugin.
- `src/platform/limiter.ts` + `limiter.test.ts` (new): bounded-concurrency limiter.
- `src/platform/container.ts` (modified): `multiAgentRun` singleton getter.
- `src/modules/reviews/run-executor.ts` (modified):
  - optional bounded parallel mode;
  - `queued` gate;
  - `grounding_dropped`;
  - trace-before-status (R7).
- `src/modules/reviews/run-port.ts` (new): implements `ReviewRunPort`.
- `src/modules/reviews/schemas.ts` (new): `GroundingDrop`, `RunTraceStored`.
- `src/modules/reviews/repository/run.repo.ts` + `repository.ts` wrapper
  (modified): `queued` support, `markRunningIfQueued`, `multi_agent_run_id` in
  history.
- `test/multi-agent-run.it.test.ts`, `test/multi-agent-run-rate-limit.it.test.ts`
  (new). `test/reviews.it.test.ts` (modified: AC-5, AC-32 assertions).
- `docs/multi-agent-benchmark.md` (new, written by the user after the manual
  benchmark; the plan only defines its structure, step 24).

client
- `src/lib/types.ts` (modified): module-local view types (Q-1).
- `src/lib/hooks/multi-agent.ts` (new), `src/lib/hooks/keys.ts` (modified).
- `src/lib/hooks/reviews.ts` (modified): `queued` polling, run-summary type.
- `src/lib/hooks/trace.ts` (modified): one retry on 404.
- `src/lib/multi-agent-estimate.ts` + `.test.ts` (new, pure; picker + configure).
- `src/lib/agent-look.ts` + `.test.ts` (new, pure; agent icon/color for configure
  and results).
- PR route `src/app/repos/[repoId]/pulls/[number]/_components/`:
  - `AgentPicker/` (new)
  - `RunReviewDropdown/` (modified: renders the picker)
  - `PrDetailHeader/` (modified: latest multi-run link)
  - `RunHistory/` (modified: tag + link, `queued`)
  - `FindingCard/` (modified: optional `showTranslate`)
  - `RunTraceDrawer/_components/TraceBody` (modified: grounding-drop list)
- New routes, each with `_components/`:
  - `src/app/multi-agent-review/page.tsx`
  - `src/app/multi-agent-review/configure/page.tsx`
  - `src/app/multi-agent-review/[runId]/page.tsx`
- `src/vendor/ui/nav.ts` (local edit approved by Q-5).
- `messages/en/runs.json`, `messages/en/prReview.json` (modified). Other locale
  folders get the same keys if they exist.
- `client/INSIGHTS.md` (record the fourth `nav.ts` local edit).

reviewer-core: none. agent-runner: none. e2e: none. mcp: none.

## 4. Contracts touched

**Shared multi-agent contracts (AC-4): module-local extension (Q-1)**

No vendored file is edited.
- Server `src/modules/multi-agent-run/schemas.ts`:
  - `AgentColumnFindingView = AgentColumnFinding.extend({ ... })` adding
    `end_line: int`, `confidence: number (0..1, Q-3)`, `rationale: string`,
    `suggested_fix: string | null`, `group_id: string | null`.
  - `AgentColumnView = AgentColumn.extend({ ... })` with
    `status: z.enum(['queued','running','done','failed','cancelled'])` and
    `findings: z.array(AgentColumnFindingView)`.
  - `MultiRunStatus = z.enum(['running','partial','done','failed','cancelled'])`
    (Q-2, computed from children).
  - `MultiAgentRunView = MultiAgentRun.extend({ ... })` adding
    `status: MultiRunStatus`, `concurrency_limit: int`,
    `requested_agent_ids: string[]`, `columns: z.array(AgentColumnViewSchema)`.
  - `Conflict` / `ConflictTake` are reused unchanged (`verdict` = severity or
    `'ignored'`).
- Client `src/lib/types.ts`: the same shapes as TS types, plus
  `RunSummaryWithParent` and `RunTraceView` with `grounding_dropped?`.
- The server module's file header comment carries a "re-vendor at the sync source"
  flag.

**Request/response schemas** (server `schemas.ts`)
- `StartMultiAgentRunBody = { agent_ids: z.array(z.string().uuid()).min(1).max(8) }`,
  with a uniqueness refine (422 on duplicates).
- `MultiRunParams = { id: uuid }`, `MultiRunChildParams = { id: uuid, runId: uuid }`.
- `LastSelectionResponse = { agent_ids: string[] | null }`.

**New routes** (every one calls `getContext`; 404 when the resource is missing or in
another workspace):

| Route | Success | Errors | Rate limit |
|---|---|---|---|
| `POST /pulls/:id/multi-agent-run` | 200 `MultiAgentRunView` | 409 `multi_run_in_progress`; 422 validation / `invalid_agents` | 10/min |
| `GET /multi-agent-runs/:id` | `MultiAgentRunView` | 404 | - |
| `GET /pulls/:id/multi-agent` | latest `MultiAgentRunView` | 404 when none | - |
| `POST /multi-agent-runs/:id/cancel` | `MultiAgentRunView` | 404 | - |
| `POST /multi-agent-runs/:id/runs/:runId/cancel` | `MultiAgentRunView` | 404 | - |
| `POST /multi-agent-runs/:id/runs/:runId/retry` | `MultiAgentRunView` | 409 `not_retryable` | 10/min |
| `GET /repos/:id/multi-agent/last-selection` | `LastSelectionResponse` | 404 | - |

`last-selection` is per Q-6.

**Existing endpoints, module-local extensions**
- Run history `GET /pulls/:id/runs` (no response schema): each item gains
  `multi_agent_run_id: string | null`. Same precedent as `eval_case_id`.
- Run trace `GET /runs/:id/trace` (raw jsonb): the stored trace gains
  `grounding_dropped?: { title, file, start_line, end_line, reason }[]`
  (`reviews/schemas.ts` `RunTraceStored`).

**DB** (one drizzle-kit migration)
- `agent_runs.multi_agent_run_id uuid NULL`, FK to `multi_agent_runs.id`
  `ON DELETE SET NULL`, plus an index.
- `multi_agent_runs.requested_agent_ids jsonb NOT NULL DEFAULT '[]'`.
- `multi_agent_runs.cancelled_at timestamptz NULL`.
- Index on `multi_agent_runs (pr_id, ran_at)`.
- New free-text value `queued` for `agent_runs.status` (no DDL).

**Vendored files**: none in `vendor/shared`. In `vendor/ui`, only `nav.ts` (Q-5).

## 5. Skills for implementer

- **onion-architecture** governs steps 4-9.
  - Routes parse input and call one service method.
  - The service takes narrow ports (`MultiRunStore`, `ReviewRunPort`,
    `AgentCatalog`, `PullLookup`) and never `Container`.
  - Drizzle stays in `repository.ts` and returns mapped types.
  - Grouping, conflict and status rules live in `domain/` without zod/drizzle.
  - The reviews executor is reached only through a port wired in
    `platform/container.ts`.
- **fastify-best-practices** governs steps 8-9.
  - Zod `params`/`body`/`response` on every route, with no hand `parse`.
  - Per-route `config.rateLimit`.
  - Throw `AppError` / `NotFoundError`; the global handler maps them.
  - Body-less POSTs declare no body schema.
- **zod** governs steps 2 and 8.
  - Use `.extend` for the view schemas.
  - Response schemas strip unknown keys, so every field the client reads must be
    declared.
- **drizzle-orm-patterns** and **postgresql-table-design** govern steps 1, 4 and 8.
  - Explicit snake_case names; FK via an arrow function with `onDelete: 'set null'`.
  - Manual index on the FK; `timestamptz`; jsonb NOT NULL with a default.
  - A transaction with `.for('update')` for the 409 guard.
  - Migrations only via `pnpm db:generate`.
- **typescript-expert** governs steps 2 and 11: status unions, no `any`.
- **react-frontend-architecture** governs steps 11-21.
  - Data goes only through `src/lib/hooks/multi-agent.ts` and `api.ts`.
  - One shared data hook serves both views.
  - PascalCase component folders with `index.ts`, `helpers.ts`, `constants.ts`,
    `styles.ts`.
  - Pure helpers are promoted to `src/lib/` only because two features use them.
- **react-best-practices** governs steps 14-21.
  - Derive conflicts and badges during render.
  - No server data copied into `useState`.
  - Effects only for the redirect, SSE and sessionStorage sync.
- **next-best-practices** governs steps 17-20.
  - Thin `page.tsx`; `'use client'` only on the interactive views.
  - `useSearchParams` behind `Suspense` on the configure page.
  - Redirect via `router.replace` in the landing component.
- **react-testing-library** governs step 22.
  - Use role/label queries.
  - The vendored `Tabs` buttons are found with `getByRole("button")`.
  - Scope `role="status"` queries.
  - Use the `src/test/user.ts` shim.
- **security** governs steps 8-9.
  - `agent_ids` are checked server-side against the workspace's enabled agents, and
    the cap is enforced there too.
  - Every new route has a workspace check.
  - Grouping and conflicts use only `file` / line range / `severity`.
- **design** governs steps 14-21.
  - Screenshots S1-S5 come first, then the `design/` artboards `ma-cols`,
    `ma-tabs`, `e-ma`.
  - No visuals beyond those plus elements an AC explicitly requires (section 9 lists
    those few).

## 6. Architecture constraints

- The server module `multi-agent-run` keeps `routes.ts -> service.ts ->
  repository.ts`. `domain/` holds only the grouping/conflict/status rules.
- `multi-agent-run/*` must not import `reviews/repository*` or
  `reviews/run-executor.ts`.
  - It depends on `ReviewRunPort`.
  - `reviews/run-port.ts` implements the port.
  - `platform/container.ts` wires them.
  - The new repository may query the `agent_runs`, `reviews`, `findings` and
    `agents` tables directly (shared schema).
- Do-not-touch:
  - `server/src/db/migrations/**` (generate only);
  - both `*/vendor/shared/**` copies (Q-1);
  - `client/src/vendor/ui/**` except the approved `nav.ts` edit (Q-5);
  - `*/pnpm-lock.yaml` (no new dependency, no queue library);
  - `agent-runner/**`;
  - `reviewer-core/**`.
- Client:
  - New routes go under `src/app/multi-agent-review/**`, feature components in
    `_components/<PascalName>/`.
  - `RunTraceDrawer` and `FindingCard` are imported cross-route from the PR route,
    never copied (AC-28a).
  - All strings live in `messages/<locale>/*.json`.
- Tests:
  - Client and server unit tests are co-located, same base name.
  - Server integration suites go in `server/test/*.it.test.ts`, like the existing
    ones.

## 7. Steps

Owner tags: `[impl]` = implementer, `[test]` = test-writer.

Lanes:
- **Phase 0**: steps 1-2, sequential, implementer.
- **Lane S** (server): steps 3-10.
- **Lane C** (client): steps 11-21.

Lanes S and C run in parallel after Phase 0. Lane C uses mocked fetch and does not
need Lane S.

**Phase 0 - schema and contracts**

1. `[impl]` **DB schema + migration** (`server/src/db/schema/runs.ts`).
   - Add to `agentRuns`: `multiAgentRunId: uuid('multi_agent_run_id').references(()
     => multiAgentRuns.id, { onDelete: 'set null' })`. Add an index
     `agent_runs_multi_agent_run_id_idx` via the table's extra-config callback.
   - Add to `multiAgentRuns`:
     - `requestedAgentIds: jsonb('requested_agent_ids').$type<string[]>().notNull().default([])`
     - `cancelledAt: timestamp('cancelled_at', { withTimezone: true })`
     - an index on `(pr_id, ran_at)`.
   - In `server/`, run `npx --yes pnpm@10 db:generate`; keep the generated SQL and
     snapshot untouched. Then run `npx --yes pnpm@10 db:migrate` locally.
   - Skill: drizzle-orm-patterns, postgresql-table-design.
2. `[impl]` **Module-local contracts (Q-1, Q-2, Q-3).**
   - Server: `src/modules/multi-agent-run/schemas.ts` with the view and request
     schemas from section 4.
   - Client: `src/lib/types.ts` with the matching types.
   - Confidence stays 0..1 on the wire. The UI multiplies by 100 only when
     rendering, through the existing `ConfidenceNum`.
   - Skill: zod, typescript-expert.

**Lane S - server**

3. `[impl]` **Limiter** (`server/src/platform/limiter.ts`).
   - `createLimiter(max)` returns `{ run<T>(fn: () => Promise<T>): Promise<T>;
     readonly active: number; readonly pending: number }`: a FIFO queue of
     resolvers, about 25 lines, no dependency.
   - Unit test `limiter.test.ts`:
     - never more than `max` concurrent;
     - FIFO order;
     - a rejecting task frees its slot.
   - Skill: onion-architecture.
4. `[impl]` **Runs repository: queued support**
   (`server/src/modules/reviews/repository/run.repo.ts` + the `ReviewRepository`
   wrapper).
   - `createAgentRun`: optional `status: 'queued' | 'running'` (default `'running'`,
     so single-agent is unchanged) and optional `multiAgentRunId`.
   - New `markRunningIfQueued(runId)`: `UPDATE … SET status='running',
     ran_at=now() WHERE id=$1 AND status='queued' RETURNING id`, returning a
     boolean (R9).
   - `cancelRunIfRunning`: match `status IN ('running','queued')`.
   - `reapStaleRunningRuns`: also reap `queued`. Otherwise an orphaned child keeps
     the PR "non-terminal" and AC-37 409s forever.
   - `activeRunsForPull`: include `queued`.
   - `listRunsForPull`: add `multi_agent_run_id`.
   - Skill: drizzle-orm-patterns.
5. `[impl]` **Executor** (`server/src/modules/reviews/run-executor.ts`).
   - Move the body of the `for (const { agent, runId } of jobs)` loop into a private
     `runJob(...)` method. Logging and try/catch stay identical.
   - `executeRuns(…, logger?, opts?: { limiter?: Limiter })`:
     - Without `opts.limiter`, keep the existing sequential loop. The single-agent
       path is unchanged.
     - With a limiter, after the shared pre-work, run
       `Promise.allSettled(jobs.map(j => limiter.run(async () => { … })))`. Inside:
       if `!(await this.repo.markRunningIfQueued(j.runId))`, call
       `runBus.complete(j.runId)` and return; otherwise `await this.runJob(...)`.
     - Children created as `running` (the first 4) skip the gate. The gate decides
       from the DB, not from `runBus.isCancelled`, because `runBus.complete()`
       clears the cancel flag (`platform/sse.ts:79`).
   - Pre-work `failAll`: never overwrite a row that is already `cancelled` (use a
     status-guarded update).
   - AC-32:
     - Map `outcome.dropped` to `GroundingDrop[]` (`title`, `file`, `start_line`,
       `end_line`, `reason`) and put it in the trace as `grounding_dropped`.
     - The trace type is `RunTraceStored` from the new `reviews/schemas.ts`.
       `saveRunTrace` / `getRunTrace` accept it.
     - Failure traces carry `[]`.
     - Read `outcome.dropped` explicitly; it is not part of the destructure at
       line 287 (INSIGHTS 2026-09-18).
   - R7: in both the success and failure paths, call `saveRunTrace` before
     `completeAgentRun`.
   - Skill: onion-architecture.
6. `[impl]` **Review run port** (`server/src/modules/reviews/run-port.ts`, new).
   - Class `ReviewRunPortImpl` implements `ReviewRunPort`.
   - `execute({ workspaceId, prId, jobs: { agentId, runId }[], limiter })`:
     - loads the pull, repo and agent rows;
     - fire-and-forgets `executor.executeRuns(..., { limiter })`;
     - background errors are logged, never thrown to the caller.
   - `cancel(runId)`: publish an info line, `runBus.cancel`,
     `repo.cancelRunIfRunning`, `runBus.complete`. Same semantics as
     `ReviewService.cancelRun`.
   - Skill: onion-architecture.
7. `[impl]` **Domain** (`server/src/modules/multi-agent-run/domain/`).
   - `grouping.ts`:
     - `groupFindings(columns)`. Columns arrive in `requested_agent_ids` order;
       findings are sorted by `file`, `start_line`, `id`.
     - For each finding, join the FIRST existing group that has the same `file`,
       no member from the same agent, and at least one member whose
       `[start_line, end_line]` overlaps; otherwise open a new group.
     - Groups with 2+ members get `group_id` = the first member's id; singletons get
       `null`.
     - Output: `Map<findingId, groupId|null>` plus the ordered location list (every
       group, including singletons).
     - Never mutates or copies finding fields (AC-21).
   - `grouping.ts` also exports `buildLocations(groups, columns)`, returning a
     `Conflict` for every flagged location:
     - `file`; `line` = min `start_line`; `title` = first member's title.
     - `takes`: one per column with status `done` only (Q-8). Each take has
       `agent_id`, `persona` = agent name, `verdict` = the member's severity or
       `'ignored'`, and `note` = the member's title or `''` (no synthesized text,
       AC-24).
     - Columns that are queued, running, failed or cancelled get no take and do not
       count toward a conflict (Q-8). The client renders their cell from the column
       status.
     - `isConflict(c)` = more than one distinct verdict among the takes.
   - `run-status.ts`:
     - `aggregateStatus(children, cancelledAt)` (Q-2), evaluated in this order:
       1. any child `queued` or `running` -> `running`;
       2. all `done` -> `done`;
       3. at least one `done` and at least one `failed`/`cancelled` -> `partial`;
       4. no `done` and (`cancelledAt` set or all `cancelled`) -> `cancelled`;
       5. otherwise -> `failed`.
     - `latestAttempts(children)`: one child per `agent_id`, newest by creation
       order (R4).
     - `wallClockMs(parentRanAt, children)`: max(child `ran_at` + `duration_ms`)
       minus `parentRanAt` over the latest attempts; while running, now minus
       `parentRanAt` (AC-16).
     - `totalCost(children)`: sum of non-null `cost_usd`.
   - Unit tests:
     - `grouping.test.ts`: the AC-20 cases, including "touches two -> joins only the
       first"; AC-21 field identity except `group_id`; the AC-23 verdict cases;
       running/failed columns yield no take.
     - `run-status.test.ts`: AC-16 (2s/3s/5s -> ~5s); AC-17 `partial`; every
       status branch.
   - Skill: onion-architecture.
8. `[impl]` **Module ports, repository, service** (`server/src/modules/multi-agent-run/`).
   - `constants.ts`: `MULTI_AGENT_CONCURRENCY = 4`, `MAX_AGENTS = 8`,
     `MULTI_RUN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' }`.
   - `ports.ts`:
     - `MultiRunStore`
     - `ReviewRunPort` (`execute`, `cancel`)
     - `AgentCatalog` (`listEnabled(workspaceId)`)
     - `PullLookup` (`getPull(workspaceId, prId) -> { id, number, repoId } | null`;
       `repoInWorkspace(workspaceId, repoId) -> boolean`)
   - `repository.ts` (implements `MultiRunStore`, returns mapped types, never
     `$inferSelect` rows):
     - `createWithChildren(input)`, in one transaction:
       - lock the PR row with `.for('update')`;
       - if any child of any multi-run of this PR is `queued`/`running`, return
         `{ conflict: true }`;
       - insert the parent with `requested_agent_ids`;
       - insert one `agent_runs` row per agent with `multi_agent_run_id`, status
         `running` for the first 4 and `queued` for the rest.
     - `getById(workspaceId, id)`
     - `latestForPull(workspaceId, prId)`
     - `childrenWithFindings(id)`: agent_runs left-joined to agents, plus reviews by
       `run_id` and their findings.
     - `markCancelled(id)`: set `cancelled_at`; return the non-terminal child ids.
     - `insertRetryChild(parentId, agentRow)`: lock the parent row, then insert
       `cancelled` when `cancelled_at` is set (Q-10), else `queued`.
     - `lastSelectionForRepo(workspaceId, repoId)`: `requested_agent_ids` of the
       newest multi-run on any PR of the repo.
   - `service.ts` `MultiAgentRunService`:
     - Constructed with ports only. Holds `Map<multiRunId, Limiter>`: created lazily
       with `createLimiter(MULTI_AGENT_CONCURRENCY)`, deleted when idle.
     - `start(ws, prId, agentIds)`:
       - 404 if the PR is not found;
       - 422 `invalid_agents` unless every id is an enabled agent of `ws`;
       - `createWithChildren`, which may yield 409 `multi_run_in_progress`;
       - `runPort.execute` with the parent's limiter;
       - returns `get()`.
     - `get(ws, id)` builds the full view:
       - `latestAttempts`, then columns (status, score, verdict, summary,
         duration, cost, findings with `group_id`);
       - `conflicts` = all flagged locations from `buildLocations`;
       - totals, `status`, `concurrency_limit`, `requested_agent_ids`,
         `pr_number`.
     - `latestForPull`
     - `cancelAll`: set `cancelled_at` first, then `runPort.cancel` each
       non-terminal child.
     - `cancelChild`: 404 unless the child belongs to the parent.
     - `retryChild`:
       - 409 `not_retryable` unless the child is the latest attempt for its agent
         and its status is `failed`;
       - `insertRetryChild`; when the new attempt is `queued`, `runPort.execute`
         with the parent's limiter. After a run-wide cancel the attempt is
         `cancelled` and is not executed (Q-10).
     - `lastSelection(ws, repoId)` (Q-6):
       - 404 for a foreign repo;
       - otherwise the ids filtered to currently enabled agents, or `null` when
         none remain or no multi-run exists.
   - Skill: onion-architecture, drizzle-orm-patterns, security.
9. `[impl]` **Routes + wiring**.
   - `routes.ts`: the 7 routes from section 4. Each does `getContext` and one service
     call. Zod `params` / `body` / `response`. `config.rateLimit` on the start and
     retry POSTs (NFR-2: one call = one request). No body schema on cancel/retry.
   - Register the plugin in `src/modules/index.ts`.
   - `platform/container.ts`: `get multiAgentRun()` singleton (it owns the limiter
     map) wiring:
     - `new MultiAgentRunRepository(this.db)`
     - `new ReviewRunPortImpl(this, this.reviewRepo, this.agentsRepo)`
     - `{ listEnabled: (ws) => this.agentsRepo.listEnabled(ws) }`
     - a `PullLookup` over the new repository
   - Add a route-header comment noting the pre-existing `GET /runs/:id/trace`
     workspace gap.
   - Skill: fastify-best-practices, onion-architecture.
10. `[test]` **Server integration tests**.
    - `server/test/multi-agent-run.it.test.ts`. Set up mock LLMs, including the
      `openrouter` intent override, and a controllable slow/failing provider.
      Cases:
      - AC-1, AC-2, AC-3;
      - AC-15: 6 agents, never more than 4 `running`, 2 `queued` until a slot frees;
      - AC-16; AC-17 `partial`;
      - AC-19: cancel one; cancel all; retry a failed agent (siblings' findings and
        timestamps unchanged); retry after cancel -> `cancelled`;
      - AC-34; AC-37 (409, no new row); AC-38 (404 for a foreign workspace on every
        route);
      - 422 for unknown / disabled / duplicate ids and for 9 ids;
      - the reaper reaps `queued`;
      - `last-selection` returns the latest ids, filtered to enabled agents.
    - Wait for the trace row, not only the status.
    - `test/reviews.it.test.ts`: AC-5 (single-agent row has
      `multi_agent_run_id = null`) and AC-32 (2 drops persisted, served by
      `GET /runs/:id/trace`).
    - `server/test/multi-agent-run-rate-limit.it.test.ts` (NFR-2): build a dedicated
      app with `nodeEnv: 'production', logLevel: 'silent'`; 10 starts pass, the 11th
      gets 429 regardless of agent count.

**Lane C - client** (starts after step 2)

11. `[impl]` **Data layer**.
    - `src/lib/hooks/keys.ts`: add `multiAgentRun(id)`, `prLatestMultiAgent(prId)`,
      `repoLastSelection(repoId)`.
    - `src/lib/hooks/multi-agent.ts` (new; exports hooks only):
      - `useMultiAgentRun(runId)`: the one shared data hook for both views (R5).
        - Calls `GET /multi-agent-runs/:id`.
        - `refetchInterval` 2500 ms while `status === 'running'`. This is the
          AC-18 / "stream drops" fallback (R8).
        - Exposes `runningRunIds`.
        - When a child SSE stream ends, invalidates itself and `reviews(prId)`.
      - `useLatestPrMultiAgentRun(prId)`: a 404 maps to `null`.
      - `useStartMultiAgentRun`, `useCancelMultiAgentRun`,
        `useCancelMultiAgentChild`, `useRetryMultiAgentChild`. Each writes the
        response into the run cache.
      - `useLastAgentSelection(repoId)`.
      - `useAgentEstimates(agentIds)`: `useQueries` over `GET /agents/:id/stats`,
        reusing `useAgentStats`'s key. A failed query means "no estimate".
    - `src/lib/hooks/reviews.ts`:
      - `usePrRuns` / `usePrActiveRuns` poll while any row is `running` or `queued`.
      - `usePrRuns` is typed `RunSummaryWithParent[]`.
    - `src/lib/hooks/trace.ts`: retry once, only on 404, after about 1 s (edge case
      "trace not ready yet").
    - Skill: react-frontend-architecture.
12. `[impl]` **Pure helpers** (two consumers each, so they live in `src/lib/`).
    - `multi-agent-estimate.ts`:
      - `agentEstimate(stats)` returns `{ ms, usd } | null`. It is null when
        `runs_30d === 0` or a field is null.
      - `formatEstimate`: `8.2s · $0.06` (AC-11).
      - `combineEstimates`: `{ maxMs, sumUsd, missing }`, rendered as
        `≈ 8.2s · $0.15`, or a partial form like `≥ $0.20 · 1 without history`
        (AC-12).
      - `defaultSelection(enabled, last)` (AC-10).
      - `MAX_AGENTS = 8`.
    - `agent-look.ts`:
      - `agentLook(agent)` returns `{ icon, color }` for the configure cards and the
        results columns/tabs. The `Agent` contract has no icon/color field.
      - Name keywords, mirroring S3-S5 and the `IntentCard/constants.ts`
        precedent:
        - security -> `Shield`, `var(--crit)`;
        - performance -> `Zap`, warning color;
        - mentor -> `Lightbulb`, blue;
        - customer -> `Users`, purple;
        - architecture -> `Boxes`, green;
        - fallback -> `Cpu`, neutral.
    - Unit tests:
      - the AC-12 numbers: 8.2s/$0.06 + 7.4s/$0.05 + 6.9s/$0.04 -> `≈ 8.2s · $0.15`;
      - plus one agent without history -> partial;
      - the AC-11 "no estimate yet" case;
      - `agentLook` fallback.
13. `[impl]` **i18n strings**: add every new label to `messages/en/runs.json`
    (results, conflicts, header, cancel/retry, landing, configure) and
    `messages/en/prReview.json` (picker).
    - Picker: "PICK AGENTS TO RUN", "Clear", "Run multi-agent review ({count})",
      "Configure agents…", "no estimate yet", the 8-agent limit tooltip,
      "No agents enabled — enable one in Settings → Agents".
    - Configure: "Run a Multi-Agent Review", subtitle, "Pull request",
      "Select a pull request…", "Agents to run", "Select all",
      "Pick a pull request first" + body, `parallel fan-out`.
    - Results: "Configure run", "{n} selected agents · parallel",
      `{count} agents · parallel fan-out · {duration}s total · {cost}`, "partial",
      "View trace", "{n} findings", "No findings", "also flagged by: {agents}",
      "Similar findings", "did not flag", "failed, no verdict", "cancelled",
      "queued", "running", "no agent produced a verdict", "Cancel run", "Cancel",
      "Retry", "part of multi-run", "Latest multi-agent run".
    - Fix `runs.page.meta`: drop "p-queue".
    - Copy the keys to other locale folders if they exist.
14. `[impl]` **PR page picker** (S1; Q-7 full replacement).
    - New `_components/AgentPicker/` (`AgentPicker.tsx`, `helpers.ts`,
      `constants.ts`, `styles.ts`, `index.ts`).
    - Custom popover: the vendored `Dropdown` cannot hold checkboxes. Copy its
      outside-click pattern and add Escape close.
    - Layout per S1:
      - "PICK AGENTS TO RUN" header with a "Clear" link (clears the selection);
      - one row per **enabled** agent: checkbox, `Cpu` icon, name, muted estimate on
        the right;
      - full-width primary "Run multi-agent review (N)" button with the users icon;
      - divider, then a muted "Configure agents…" row linking to
        `/multi-agent-review/configure?pr=<prId>` (AC-14).
    - Estimates:
      - Each row shows `formatEstimate` or "no estimate yet" (AC-11).
      - The combined estimate (AC-12) is a muted mono line under the button. S1 does
        not show it, but AC-7/AC-12 require it (section 9).
    - Accessibility: each checkbox's accessible name = agent name + estimate
      (NFR-5).
    - Selection:
      - Default from `useLastAgentSelection(repoId)` / all enabled (AC-10).
      - Once 8 are checked, the remaining checkboxes are disabled with a `title`
        tooltip (AC-9).
      - Zero enabled agents: empty line, button disabled.
      - A stats failure shows "no estimate yet".
    - Run:
      - 1 checked: the existing `useRunReview({ prId, agentId })` plus the existing
        `onRunsStarted` (AC-8).
      - 2+ checked: `useStartMultiAgentRun`, then
        `router.push('/multi-agent-review/<id>')` (AC-9).
      - 409: toast, then navigate to `useLatestPrMultiAgentRun`'s run.
    - `RunReviewDropdown.tsx`: the trigger button stays (S1 "Run Review" with
      chevron). The item list is replaced by `AgentPicker`. "Run all enabled
      agents" and disabled-agent items are removed (Q-7).
    - Skill: react-best-practices, design.
15. `[impl]` **PR page links**.
    - `PrDetailHeader.tsx`: when `useLatestPrMultiAgentRun(prId)` returns a run,
      render a secondary small "Latest multi-agent run" button-link to
      `/multi-agent-review/<id>`, left of "Run Review" (AC-36). S1 shows a PR
      without one.
    - `RunHistory.tsx`:
      - rows with `multi_agent_run_id` show a "part of multi-run" tag linking to the
        parent (AC-6);
      - `queued` renders like `running` with a "queued" label.
16. `[impl]` **FindingCard + TraceBody**.
    - `FindingCard.tsx`: optional `showTranslate?: boolean`, default `true`, so
      existing callers are unchanged. When `false`, Translate is not rendered
      (AC-33: exactly Accept, Dismiss, Turn into eval case).
    - `RunTraceDrawer/_components/TraceBody`:
      - render `trace.grounding_dropped` (title, `file:start-end`, reason) next to
        the existing grounding summary (AC-31);
      - render nothing when the list is absent or empty;
      - no other drawer change (AC-28a).
17. `[impl]` **Landing** (AC-36a, `e-ma` artboard).
    - `src/app/multi-agent-review/page.tsx` (thin) + `_components/MultiAgentLanding/`.
    - Zero enabled agents: the empty state with icon, `runs.page.noAgents.title` /
      `.body` and a "+ Go to Agents" button to `/agents`.
    - One or more enabled: `router.replace('/multi-agent-review/configure')`.
18. `[impl]` **Configure run** (S2/S3).
    - `src/app/multi-agent-review/configure/page.tsx` (thin, with a `Suspense`
      boundary for `useSearchParams`) + `_components/ConfigureRunView/`, with nested
      `_components/PrStep/` and `_components/AgentCard/`.
    - Layout per S2/S3: breadcrumb "Multi-Agent Review > Configure run", title,
      subtitle, numbered steps.
    - Step 1 (`PrStep`):
      - vendored `Dropdown` over the active repo's PRs (`#482 · <title>` items);
      - `?pr=<prId>` pre-selects (AC-14);
      - a PR-list error shows a retry affordance.
    - Step 2:
      - Before a PR is chosen: dimmed header plus the dashed "Pick a pull request
        first" box (AC-13).
      - After: "Select all" link (respects the cap of 8) and one `AgentCard` per
        enabled agent.
    - `AgentCard`:
      - checkbox, `agentLook` icon tile, name, estimate top right;
      - one-line summary = this agent's latest review summary on the PR (from
        `usePrReviews`), else the agent description;
      - selected cards get the agent-color border; unselected cards are neutral.
    - Below: the run button "Run multi-agent review (N)" plus the muted mono
      combined estimate `≈ Xs · $Y · parallel fan-out`. Routing is the same as step
      14 (AC-8, AC-9).
    - The run button is `disabled` while no PR is selected or nothing is checked.
      S2 draws it in the primary style.
19. `[impl]` **Results page shell** (S4/S5).
    - `src/app/multi-agent-review/[runId]/page.tsx` (thin) +
      `_components/MultiAgentRunView/` (`MultiAgentRunView.tsx`, `helpers.ts`,
      `constants.ts`, `styles.ts`, `index.ts`).
    - Data:
      - `useMultiAgentRun(runId)` once;
      - `usePrReviews(run.pr_id)` for the full finding records, joined by finding
        id (R5).
    - Header per S4/S5:
      - "Configure run" secondary button to `/multi-agent-review/configure?pr=<prId>`;
      - title, "{n} selected agents · parallel";
      - `Columns | Tabs` segmented toggle with `aria-pressed`. The choice is kept in
        `sessionStorage`, and the page container is not remounted on switch, so
        scroll is kept (AC-27).
      - Second row: `#<number> <title>` on the left; on the right
        `{n} agents · parallel fan-out · {X}s total · ${Y}`, with "partial" when any
        column is not `done` or has a null cost (AC-26, edge "all fail" -> `$0
        partial`).
      - While `status === 'running'`: a "Cancel run" secondary button next to the
        toggle (AC-19).
    - A polite `aria-live` region announces column status changes (NFR-5).
    - 404 renders a not-found state.
    - `helpers.ts`:
      - `isConflict(conflict)`;
      - `cellFor(column, take)` -> severity + note / "did not flag" /
        "failed, no verdict" / "cancelled" / "queued" / "running" (Q-8);
      - `headerMeta`;
      - `similarMembers(finding, columns)`.
20. `[impl]` **Views and disagreement block** (nested `_components/` under
    `MultiAgentRunView/`).
    - `ColumnsView/` + `AgentColumn/` (S4):
      - the row scrolls horizontally;
      - each column has a colored top border (`agentLook`), icon tile, name,
        `Xs · $Y`, score ring and status chip;
      - finding cards: severity icon, title (truncated, `title` attribute),
        `file:line`, severity left border, "also flagged by: …" badge listing every
        other group member (AC-22);
      - footer: "View trace" + "{n} findings";
      - "No findings" state, distinct from `failed`;
      - while `running`: a compact `LiveLogStream` fed by `useRunEvents([run_id])`
        (AC-28);
      - footer action: "Cancel" (non-terminal) or "Retry" (`failed`) small secondary
        button (AC-19);
      - "View trace" opens the PR route's `RunTraceDrawer` with that column's
        `run_id`, `running`, agent name and PR number (AC-28a).
    - `TabsView/` + `AgentSummaryCard/` (S5):
      - vendored `Tabs`, each tab = icon + name + score;
      - the active panel's summary card: score ring, colored name, summary,
        "View trace", `Xs · $Y`;
      - then `FindingCard` per finding (`showTranslate={false}`, `prId`, `agentId`,
        `onAction` via `useFindingAction`), plus `SimilarFindings/` (other members'
        agent, severity, original title/rationale, AC-22);
      - SUGGESTED FIX comes from `FindingCard` and is omitted when null (AC-29).
    - `DisagreementBlock/` (S4/S5 bottom):
      - "WHERE AGENTS DISAGREE" heading;
      - "Show only conflicts" as `role="switch"` with an accessible name. Its state
        is lifted into `MultiAgentRunView`, so it survives a mode switch (AC-30).
      - one card per location: `<> file:line` + title, one cell per participating
        agent (AC-24);
      - toggle off lists all flagged locations; on lists only `isConflict` (AC-25);
      - when no agent produced a verdict, an explanatory line instead of hiding the
        block.
    - Skill: react-best-practices, design.
21. `[impl]` **Sidebar** (Q-5).
    - In `client/src/vendor/ui/nav.ts`, add a group `{ section: "GLOBAL", items: [{
      key: "multi-agent", label: "Multi-Agent Review", icon: "Users", href:
      "/multi-agent-review" }] }` after SKILLS LAB, matching S1-S5 order. No `gKey`.
    - `activeKeyFor` and `shell.nav.multi-agent` already exist.
    - Record the fourth local edit in `client/INSIGHTS.md` (Codebase Patterns, the
      existing `nav.ts` entry, "Port all four edits to the sync source").
22. `[test]` **Client tests** (co-located):
    - `AgentPicker.test.tsx`: AC-7; AC-8 (the network call is `/review`); AC-9 cap
      and re-enable; AC-10 default; AC-11; AC-12; AC-14 link; zero agents; stats
      failure; Clear.
    - `ConfigureRunView.test.tsx`: AC-13 disabled step 2, card population, AC-14
      preselect, PR-list error retry, Select all respecting 8.
    - `MultiAgentLanding.test.tsx`: AC-36a, both branches.
    - `MultiAgentRunView.test.tsx`: AC-26 partial vs plain; AC-27 persistence; AC-30
      toggle survives a mode switch; AC-35 reload shows current statuses; cancel run.
    - `AgentColumn.test.tsx`: AC-18 queued -> running -> done; AC-22 badge with 2
      names; AC-28 trace opens the right run id; truncation `title`; retry/cancel
      buttons by state.
    - `TabsView.test.tsx`: AC-29; AC-33 exactly 3 buttons, with Learn / Reply / Translate
      absent from the DOM; AC-22 Similar findings with 2 entries.
    - `DisagreementBlock.test.tsx`: AC-24 failed cell never "did not flag"; Q-8
      running label; AC-25 (2 agreements + 1 conflict).
    - `RunHistory.test.tsx`: AC-6.
    - `RunTraceDrawer.test.tsx`: AC-28a same tabs/footer; AC-31 two drops.
    - `FindingCard.test.tsx`: `showTranslate` default unchanged.
    - Run by base-name filter (the route paths contain brackets).

**Phase 3 - docs and validation**

23. `[impl]` **Docs**: update `server/README.md` and `client/README.md` route maps
    with the new routes and pages. Record non-obvious learnings in the package
    `INSIGHTS.md` (engineering-insights), at most 3 entries.
24. **NFR-1 benchmark** (manual, by the user, after implementation; Q-9).
    - Setup: seeded PR #482.
    - Configurations:
      - 1-agent: Security, via the single-agent flow;
      - 3-agent: Security + Performance + Junior Mentor, via multi-agent-run.
    - Run each configuration 3 times and take the median of: wall-clock, input and
      output tokens, cost, findings count.
    - Report: `server/docs/multi-agent-benchmark.md` with the raw per-run numbers,
      the medians, the ratio with no adjustment toward 3x, and explanations of any
      deviation.
    - Not part of tests or CI.

## 8. Acceptance checks

server (`cd server`):
- `npx --yes pnpm@10 db:generate` produces exactly one new migration;
  `npx --yes pnpm@10 db:migrate` applies it.
- `npx --yes pnpm@10 typecheck`
- `npx --yes pnpm@10 test`. Run the `.it` suites 2-3 times because of the
  documented flake.
- Focused run:
  `npx --yes pnpm@10 exec vitest run multi-agent-run grouping run-status limiter reviews.it`
- `git status server/src/db/migrations` shows only drizzle-kit output.

client (`cd client`):
- `npx --yes pnpm@10 typecheck` · `npx --yes pnpm@10 test` · `npx --yes pnpm@10 lint`
- Focused run: `npx --yes pnpm@10 exec vitest run AgentPicker ConfigureRunView
  MultiAgentLanding MultiAgentRunView AgentColumn TabsView DisagreementBlock
  RunHistory RunTraceDrawer FindingCard multi-agent-estimate agent-look`

Boundaries:
- `git diff --stat agent-runner reviewer-core server/src/vendor/shared client/src/vendor/shared`
  is empty.
- `git diff --stat client/src/vendor/ui` lists only `nav.ts`.

Browser (dev servers on :3000/:3001, Postgres up; land on `/` first per
`client/INSIGHTS.md`). Compare each screen side by side with S1-S5:
1. PR page, Run Review (S1):
   - only enabled agents, with estimates;
   - Clear works; the 9th checkbox is disabled;
   - 1 agent -> the existing single run; 3 agents -> navigates to
     `/multi-agent-review/<id>`.
2. Configure run (S2 then S3):
   - step 2 disabled until a PR is picked; `?pr=` preselects;
   - Select all; combined estimate line.
3. Results Columns (S4) with 5+ agents:
   - `queued` then `running`, never more than 4 running;
   - live logs per running column; header totals with "parallel fan-out".
4. Tabs (S5):
   - 3 actions only; Similar findings; switching modes keeps the conflicts toggle;
   - a reload keeps the mode and the live state.
5. Cancel one column, then cancel the run. Retry a failed agent (force a failure with
   a missing provider key). Retry after a run-wide cancel yields `cancelled`.
6. View trace from a column and from a tab: the same drawer as the PR page, with the
   grounding-drop list.
7. `/multi-agent-review`:
   - zero enabled agents -> `e-ma` empty state;
   - otherwise -> redirect to configure;
   - the sidebar GLOBAL "Multi-Agent Review" item is active.
8. The PR "Agent runs" tab shows the "part of multi-run" tag and link. The PR header
   shows "Latest multi-agent run".

## 9. Risks & open questions

Open questions: none. All round-1 questions are answered (section 11).

Design decisions the implementer must not change silently. Each one is required by an
AC and not shown in the screenshots; flag it in the browser check:
- The picker's combined-estimate line under the button (AC-7/AC-12; S1 has none).
- Picker row estimates use `Xs · $Y` (AC-11); S1 shows `~6s`.
- The configure run button is disabled without a PR; S2 draws it enabled.
- Placement of cancel/retry controls (column footer, "Cancel run" in the header) and
  of the PR header "Latest multi-agent run" link. These are not in any screenshot.
- Agent icon/color come from name keywords (`agent-look.ts`) because `Agent` has no
  such field. An agent with an unmatched name gets the neutral `Cpu` look.

Risks:
- **Orphaned `queued` rows**: without step 4's reaper change they block AC-37 forever
  after a restart. Check every `'running'` filter:
  `grep -rn "'running'" server/src client/src`.
- **Queued cancel race**: `runBus.complete()` clears the cancel flag, so the executor
  must gate on the DB (`markRunningIfQueued`).
- **Shared pre-work**: one diff load and one intent derivation feed all children. A
  pre-work failure fails every child (existing behaviour).
- **Provider 429s** are more likely with 4 concurrent LLM calls. Each child records
  its own failure (AC-17) and can be retried.
- **Limiter is in memory**: after a restart in-flight children are reaped, so the
  bound of 4 still holds.
- **409 guard**: relies on the PR row lock inside `createWithChildren`. No other path
  may insert a multi-run.
- **R7 reorder** touches the single-agent path. Statuses still flip exactly once;
  only the ordering relative to the trace changes.
- **For architecture-reviewer**: the `ReviewRunPort` boundary, the container
  singleton, `domain/` purity, no `$inferSelect` leaking, and module-local schemas
  instead of vendored edits.
- **For security review**:
  - workspace checks on all 7 new routes;
  - `agent_ids` validation and the cap of 8 enforced server-side;
  - the pre-existing gaps on `GET /runs/:id/trace` and `POST /runs/:id/cancel`
    remain (out of scope); the multi-agent UI uses the new checked cancel route.
- **AC-18 wording**: column status comes from polling the aggregate endpoint plus SSE
  completion, not from an SSE status event (R8).

## 10. Could not determine

- Design: screenshots S1-S5 were read directly. The `design/` HTML fallback
  (`ma-cols`, `ma-tabs`, `e-ma`) is bundled; only its artboard declarations could be
  grepped. The implementer opens it in a browser for the `e-ma` empty state (step 17)
  and for any detail S4/S5 do not cover (queued/running/failed column states).
- Not read in full, to be read before the matching step (none is expected to change
  the plan's shape):
  - `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`
  - `RunHistory.tsx`, `TraceBody`
  - `client/src/lib/api.ts` (404/409 error shape)
  - `client/src/lib/types.ts`
  - `server/src/modules/index.ts`
  - the `reviews/repository.ts` wrapper
  - `server/test/helpers/runs.ts`
  - seeded agent names for NFR-1
  - other `messages/<locale>/` folders

## 11. Requirements review

Questions and answers (user, relayed by the coordinator, 2026-10-17):
1. **Q-1** Vendored contract edit vs module-local. Answer: *"Module-local
   розширення типів … НЕ правити vendored-копії напряму."* The server module keeps
   the spec's name `multi-agent-run` (NFR-6); the client route folder is
   `multi-agent-review`.
2. **Q-2** Aggregate status. Answer: *"Так, додати. Значення:
   running/partial/done/failed/cancelled, обчислюється з дочірніх agent_runs."* The
   plan has no `queued` parent status: all-queued maps to `running`.
3. **Q-3** Confidence scale. Answer: *"Залишити внутрішню шкалу 0..1 … форматування
   у відсотки (×100) лише на рівні відображення в UI."*
4. **Q-4** Screenshot paths. Answer: five PNG paths (S1-S5, section 2). All were
   read before steps 14 and 18 were written.
5. **Q-5** Local `nav.ts` edit. Answer: *"Так, дозволено, додати 'Multi-Agent
   Review' в кінець списку GLOBAL-групи, за тим самим патерном."* GLOBAL does not
   exist yet, so step 21 creates it after SKILLS LAB (S1-S5 order) with this single
   item.
6. **Q-6** Last selection. Answer: *"Новий GET /repos/:id/multi-agent/last-selection,
   що читає requested_agent_ids останнього multi-run на цьому repo."* Filtered to
   currently enabled agents (AC-10 lists only enabled ones).
7. **Q-7** Picker replaces the dropdown. Answer: *"Так, повністю замінює … 1 вибраний
   агент → існуючий одноагентний review-флоу без змін, 2+ → multi-run. 'Run all
   sequential' і запуск вимкнених агентів прибираються."*
8. **Q-8** Disagree cell for queued/running. Answer: *"Показувати мітку статусу …
   такий агент НЕ враховується в обчисленні конфлікту … поки не дійде до
   done/failed/cancelled."*
9. **Q-9** Benchmark. Answer: *"Користувач запускає вручну після імплементації …
   Агенти — Security, Performance, Junior Mentor … Звіт —
   server/docs/multi-agent-benchmark.md."* The 1-agent baseline is Security (first
   named); the user may substitute another and record it in the report.
10. **Q-10** Retry after a run-wide cancel. Answer: *"Дозволити retry і після run-wide
    cancel, але нова спроба одразу створюється зі статусом cancelled (без
    фактичного запуску)."*

Gaps / conflicts found (handled in the plan, spec not edited):
- Spec "Current state" says `multi_agent_runs.created_at`; the column is `ran_at`.
  There is no requested-ids column (step 1 adds one).
- No `queued` status exists anywhere; the reaper, cancel, active-runs and polling
  code only know `running` (step 4, step 11).
- `ConflictTake` cannot express failed/cancelled/queued/running. The client derives
  those cells from column status; `Conflict.line` = the first line of the location.
- `MultiAgentRun.conflicts` also carries agreement locations (needed for AC-25 with
  the toggle off).
- `AgentColumnFinding` has no accept/dismiss/eval state; the Tabs view uses the
  `GET /pulls/:id/reviews` records.
- `FindingCard` has a 4th action (Translate) and S5 shows 5 actions. AC-33 requires
  exactly 3.
- `RunSummary` has no `multi_agent_run_id` (AC-6), and AC-4 does not list it. It is
  added as a module-local extension.
- AC-18 assumes the SSE stream carries status changes; it does not (R8).
- The edge case "stream drops" names `GET /pulls/:id/runs/active`; the plan polls the
  aggregate endpoint instead (R8).
- AC-27's "scroll position of findings already open" is not precisely testable. The
  plan keeps window scroll and view state.
- Cross-reference typos in the spec: AC-1 "per AC-14" means AC-15; AC-36a
  "Configure run (AC-9)" means AC-13.
- `runs.page.meta` says "fan-out via p-queue"; S4/S5 say "fan-out via worktrees";
  AC-26 says "parallel fan-out", and AC-26 wins.
- Screenshot vs AC differences: picker estimates, the combined line, the disabled
  run button, "did not flag" reasons, the unselected Architecture cell. Resolution is
  in section 9 / section 2.
- `Agent` has no icon/color, yet S3-S5 show per-agent icons and colors (step 12
  `agent-look.ts`).
- The spec names no cancel/retry routes; the plan adds them under
  `/multi-agent-runs/:id/...` so NFR-4 holds.

Recommendations (planner proposals, including the verdict on each of the spec's
"simplicity bias" notes; user decision: accepted as part of approving the plan's
defaults and execution mode):
- **R1 Concurrency (spec note: confirmed, with a change).** A small in-process
  limiter, no library. It is passed into `executeRuns` (shared diff and intent
  pre-work), not used to call the single-agent path N times. One limiter per
  multi-run, so retries share the bound.
- **R2 Grouping/conflicts on read (spec note: confirmed).** Pure `domain/`
  functions, called from the `GET`.
- **R3 Grounding-drop list (spec note: confirmed, trace-blob variant).**
  `run_traces.trace.grounding_dropped`; no column.
- **R4 Retry as a new child row (spec note: confirmed).** "Superseded" is derived on
  read; no flag column.
- **R5 One shared data hook (spec note: confirmed).** `useMultiAgentRun`, plus the
  existing `usePrReviews` for action state.
- **R6 Landing (spec note: confirmed).** Empty state or redirect only.
- **R7** Save the trace before the status flip (fixes the INSIGHTS race), and keep
  the client's single 404 retry.
- **R8** Status via aggregate polling plus SSE completion; SSE feeds only the live
  logs.
- **R9** Wall-clock: reset `ran_at` when a queued child starts; no new column.
- **R10** The 409 guard uses a PR row lock in one transaction.

## 12. Execution mode

**multi-agent**. User's choice: *"Multi-agent режим (твоя рекомендація):
implementer → test-writer → check-runner → architecture-reviewer/plan-verifier, з
можливими паралельними гілками server/client після базових кроків (міграція +
контракти)."*

Sequence:
1. implementer: Phase 0 (steps 1-2).
2. Two parallel lanes:
   - **Lane S**: implementer steps 3-9, then test-writer step 10.
   - **Lane C**: implementer steps 11-21, then test-writer step 22.
3. implementer step 23.
4. check-runner runs section 8 (server, client, boundary checks, browser check
   against S1-S5).
5. architecture-reviewer and plan-verifier in parallel.

Step 24 (benchmark) is run manually by the user after the chain completes.
