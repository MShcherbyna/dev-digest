# Spec: Multi-Agent Review
Spec ID: SPEC-2026-10-16-multi-agent-review
Status: draft
Supersedes: none

## Problem and user

A single pull request can carry security risk, performance regressions and
domain-rule violations at the same time. One review agent, tuned for one
angle, misses what it was not built to look for. Running several specialized
agents (Security, Performance, Junior Mentor, Customer-Facing, Architecture,
…) in parallel widens coverage — but only if the product collapses duplicate
findings, surfaces where the agents disagree, and never hides the extra time
and cost of running more than one agent.

**User:** the DevDigest studio user reviewing a pull request of a connected
repository, deciding which agents to run and how to act on their combined
output.

**Want:**
- a way to pick a PR and a set of agents, see their estimated time/cost, and
  launch them together, either from the PR page or from a dedicated
  "Configure run" screen;
- the agents to run in parallel, grouped under one parent run;
- a results view that collapses similar findings across agents without
  losing which agent said what, and a dedicated block showing exactly where
  the agents disagree, including an agent that looked at a spot and found
  nothing;
- the existing single-agent review, trace drawer and live log stream to keep
  working unchanged.

### Current state (as of 2026-10-16, for context only)

This section corrects brief-writing premises against the code — it does not
restate requirements.

- **Execution is sequential, not parallel.** `run-executor` loops over the
  selected agents and awaits each one in turn; it does not fan them out
  concurrently. One agent failing does not stop the others, because the loop
  catches and records each agent's own error — this part already holds.
- **`POST /pulls/:id/review` takes one agent or all agents, not a list.** Its
  body is `{ agentId }` or `{ all: true }`; there is no `agentIds[]` shape.
- **No duplicate-finding heuristic exists anywhere in `server/` or
  `reviewer-core/`.** The closest relative is in eval scoring, which matches
  a produced finding to an *expected* finding by same file + overlapping line
  range — not finding-to-finding across agents.
- **Multi-agent pieces exist in the shared contract and the schema, but
  nothing is wired to them:**
  - Both vendored copies of `@devdigest/shared` already declare
    `MultiAgentRun`, `AgentColumn` and `Conflict` types, and name two routes,
    `POST /pulls/:id/multi-agent-run` and `GET /pulls/:id/multi-agent`.
    Neither route is implemented on the server or called from the client.
  - The `multi_agent_runs` table exists (`id`, `workspace_id`, `pr_id`,
    `created_at`). `agent_runs` has no foreign key to it, and nothing writes
    rows to either side of that relationship.
  - Client message strings for a multi-agent results page exist in
    `client/messages/en/runs.json`, but there is no page, no route and no
    sidebar entry. The sidebar's `GLOBAL` group in the screenshots
    ("Multi-Agent Review") is not present today.
- **The trace stores a summary, not a structured grounding list.**
  `GET /runs/:id/trace` returns a pass/fail count (e.g. "3/4 passed") and
  free-text log lines. The list of findings the grounding gate dropped, with
  their reasons, is computed during the run but never persisted.
- **`Learn` and `Reply to author` have no backend route.** Only `Accept` and
  `Dismiss` are registered against a finding. `Turn into eval case` 422s with
  `undecided` until the finding has been accepted or dismissed.
- **Per-agent historical stats already exist and are reusable as-is.**
  `GET /agents/:id/stats` returns `avg_duration_ms` and `avg_cost_usd` over
  the agent's last 30 days of successful runs.
- **Live status and trace plumbing already exist and are reusable as-is.**
  One SSE-style event stream per run (`GET /runs/:id/events`), a polling
  fallback (`GET /pulls/:id/runs/active`), and `GET /runs/:id/trace` for
  `RunTraceDrawer`. `LiveLogStream` only renders whatever events it is given
  — it has no per-agent assumptions baked in.
- **`GET /runs/:id/trace` does not check workspace ownership today** (a known
  gap, tracked, not fixed by this spec — see Out of scope).
- **Known gotcha (from `server/INSIGHTS.md`):** a run's status is written to
  the DB before its trace is persisted, so a client that polls status and
  immediately requests the trace can race it. This applies per child
  `agent_run` here exactly as it does for a single-agent run today.

## Goals / Non-goals

### Goals

- An agent picker on the PR page (`Run Review` dropdown) and a standalone
  "Configure run" screen, both showing per-agent historical time/cost
  estimates and a combined estimate, as in the screenshots.
- A new `multi-agent-run` service that fans the selected agents out in
  parallel (bounded concurrency), creates one `multi_agent_runs` parent row,
  and links each child `agent_runs` row to it.
- A results page with two view modes, `Columns` (live per-agent status) and
  `Tabs + detail` (per-agent tab with full finding detail and actions),
  reusing `LiveLogStream` and `RunTraceDrawer`.
- Grouping of similar findings across agents by a fixed, non-configurable
  heuristic, without altering or hiding any agent's original finding text or
  authorship.
- A "Where agents disagree" block, with a "Show only conflicts" toggle, that
  states each participating agent's verdict at a location, including an
  explicit "did not flag" state.
- Retry of a single failed agent within an existing multi-run, and
  cancellation of one agent or the whole run.
- A validation benchmark comparing 1-agent vs 3-agent runs on the same PR,
  recorded honestly (median of 3 runs each, no rounding toward an expected
  ratio).

### Non-goals

- **No change to single-agent review.** `POST /pulls/:id/review` and its
  existing UI (the plain "Run Review" button path for one agent) are
  untouched; picking exactly one agent in the new picker still goes through
  that existing flow (AC-11).
- **No `ci/` or `agent-runner/` changes.** `ci/` does not exist in this
  worktree; `agent-runner/` is the CI runner package owned by a different
  worktree. This spec never asks for a route, type or file in either.
  (See Out of scope.)
- **No configurable similarity threshold.** The grouping rule (AC-20) is
  fixed in v1; a settings UI for it is out of scope.
- **No `Learn` or `Reply to author` implementation.** Both are hidden in the
  multi-agent results page (AC-33); building their backend is a separate
  spec.
- **No fix to the pre-existing `GET /runs/:id/trace` workspace-check gap.**
  Noted as a known issue (AC-41); only the *new* multi-agent endpoints get
  the check in this spec.
- **No re-description of how a single agent review itself works**
  (prompting, grounding gate scoring, dedup inside one agent's own findings)
  beyond what changes to make it run inside a parallel fan-out (AC-13–AC-16).
- **No multi-workspace or multi-repo fan-out.** One multi-run always targets
  one PR of one repository.

## User stories

- **US-1** — As a reviewer, I want to pick several agents from the PR page's
  "Run Review" menu and see each one's estimated time/cost before I commit,
  so I can judge whether the extra coverage is worth the extra cost.
- **US-2** — As a reviewer who wants a full picker experience, I want a
  dedicated "Configure run" screen where I choose a PR, then choose agents
  from cards showing their last result and historical cost, so I can compare
  agents before running them.
- **US-3** — As a reviewer, I want the agents to run in parallel and the
  results page to show each agent's live status as it progresses, so one
  slow agent doesn't make me think the whole review is stuck.
- **US-4** — As a reviewer, I want one agent's failure to never hide or
  cancel the others' results, so partial coverage is still usable.
- **US-5** — As a reviewer, I want near-duplicate findings from different
  agents grouped together, while still being able to see each agent's
  original wording and who said it, so I don't triage the same issue twice.
- **US-6** — As a reviewer, I want a "Where agents disagree" view, with a
  toggle to show only conflicts, so I can spend my attention on the spots
  where agents actually disagree rather than where they all agree (or all
  stayed silent).
- **US-7** — As a reviewer, I want to switch between a `Columns` layout (for
  a quick side-by-side scan while agents are still running) and a `Tabs +
  detail` layout (for acting on one agent's findings at a time), so the page
  fits both a quick check and a deep review.
- **US-8** — As a reviewer, I want Accept, Dismiss and Turn into eval case to
  work on a multi-agent finding exactly as they do today, so my existing
  triage habits transfer.
- **US-9** — As a reviewer, I want to retry just the one agent that failed,
  without re-running the agents that already succeeded, so a transient model
  error doesn't cost me the whole run again.
- **US-10** — As an engineer validating this feature, I want an honest 1-vs-3
  agent benchmark on a fixed PR, so I can tell whether "parallel" actually
  delivers wall-clock savings or just redistributes the same cost.

## Acceptance criteria (EARS)

> **Size note:** this spec holds more than the usual ~15 ACs. Per the user's
> resolved choice (Q-12, 2026-10-16), it stays one cross-module spec with ACs
> grouped by area, following the precedent of SPEC-2026-10-12-pr-brief.
>
> **Status of ACs:** all ACs are user-confirmed (2026-10-16) via 19 resolved
> questions (Q-1…Q-19), relayed by the coordinating agent. Each AC below
> cites the question that decided it where one applies.

### A. API contract and data model

- **AC-1** — The server (shall) expose `POST /pulls/:id/multi-agent-run`,
  body `{ agent_ids: string[] }` (1–8 ids, AC-9), which creates one
  `multi_agent_runs` row (workspace, PR, requested agent ids, created-at) and
  one child `agent_runs` row per requested agent, and returns the created
  `MultiAgentRun`. The existing `POST /pulls/:id/review` is unchanged and
  keeps handling the single-agent and "all agents, sequential" cases. (Q-2)

  Traces: US-1, US-2. Verify: integration - posting 3 agent ids creates 1
  `multi_agent_runs` row and 3 linked `agent_runs` rows, all initially
  `queued` or `running` per AC-14; the existing single-agent endpoint's
  behavior is unchanged by a contract test run before and after.
- **AC-2** — The server (shall) expose `GET /multi-agent-runs/:runId`,
  returning one `MultiAgentRun` (its own child columns, aggregate status,
  aggregate time/cost) by id, independent of the originating PR route, so the
  results page's own URL (AC-35) survives a reload.

  Traces: US-3, US-7. Verify: integration - a reload against this URL after
  the run has progressed returns live/updated child statuses, not a cached
  snapshot from creation time.
- **AC-3** — The server (shall) expose `GET /pulls/:id/multi-agent`,
  returning the PR's most recent `MultiAgentRun` (or 404 if none exists), so
  the PR page can link to "the latest multi-run" (AC-36).

  Traces: US-1. Verify: integration - after two multi-runs on the same PR,
  this returns the second one's id.
- **AC-4** — The shared `MultiAgentRun`, `AgentColumn` and
  `AgentColumnFinding` contracts (shall) be extended identically in both
  vendored copies (`server/src/vendor/shared`, `client/src/vendor/shared`) to
  add:
  - `AgentColumn.status`: `queued | running | done | failed | cancelled`;
  - `AgentColumnFinding.confidence: number` (0–100), `rationale: string`,
    `suggested_fix: string | null`, `group_id: string | null`;
  - `MultiAgentRun.concurrency_limit: number` and
    `MultiAgentRun.requested_agent_ids: string[]`.

  `Conflict` keeps its existing shape (location, per-agent verdicts).

  Traces: AC-1, AC-14, AC-20. Verify: unit - the two vendored copies are
  byte-identical (`diff` prints nothing) after the change.
- **AC-5** — A migration (shall) add `agent_runs.multi_agent_run_id` (nullable
  FK to `multi_agent_runs.id`) via `pnpm db:generate`, never hand-written,
  keeping `server/src/db/migrations/meta/*_snapshot.json` in sync. A
  single-agent run leaves this column `null`.

  Traces: AC-1. Verify: integration - a single-agent `POST /pulls/:id/review`
  still creates an `agent_runs` row with `multi_agent_run_id = null`; a
  multi-agent child row has it set to its parent's id.
- **AC-6** — Each multi-run child `agent_runs` row (shall) remain visible in
  the PR's "Agent runs" tab exactly as a single-agent run is, additionally
  tagged "part of multi-run" with a link to the parent `MultiAgentRun`. (Q-15)

  Traces: US-3. Verify: component - the Agent runs tab renders a multi-run
  child row with the tag and a working link; a single-agent row shows no tag.

### B. Picker: PR page and Configure run

- **AC-7** — WHEN the user opens the PR page's "Run Review" dropdown, the
  client (shall) show a checkbox list of enabled agents (AC-10) under "PICK
  AGENTS TO RUN", each with its historical time/cost estimate (AC-11), and a
  "Run multi-agent review (N)" button where N is the number of checked
  agents, plus a "Configure agents…" link.

  Traces: US-1. Verify: component - checking 2 of 4 agents updates the
  button label to "(2)" and its combined estimate.
- **AC-8** — WHEN the user has exactly one agent checked in the PR page
  picker and clicks the run button, the client (shall) call the existing
  single-agent `POST /pulls/:id/review` (not the multi-agent endpoint), so
  the single-run flow, its page and its history entry are unchanged. (Q-11)

  Traces: US-1. Verify: integration - with 1 agent selected, the network call
  observed is `POST /pulls/:id/review`, not `/multi-agent-run`.
- **AC-9** — WHEN the user has two or more agents checked and clicks "Run
  multi-agent review (N)", the client (shall) call
  `POST /pulls/:id/multi-agent-run` with those agent ids and navigate to the
  results page (AC-35) for the created run. The picker (shall) refuse
  selection beyond 8 agents (checkbox disabled past the 8th, with a tooltip
  explaining the limit). (Q-10, Q-11)

  Traces: US-1. Verify: component - a 9th checkbox is disabled while 8 are
  checked; unchecking one re-enables it.
- **AC-10** — The agent list, in both the PR page picker and Configure run,
  (shall) include only agents with `enabled: true`. Default selection
  (shall) be: the workspace's last selection of agent ids for this
  repository if one exists, otherwise all enabled agents. (Q-10)

  Traces: US-1, US-2. Verify: integration - after running agents {A, B} on
  repo X, reopening the picker for a different PR in repo X pre-checks {A,
  B}; a repo with no prior multi-run selection pre-checks every enabled
  agent.
- **AC-11** — Each agent's displayed estimate (shall) be computed from
  `GET /agents/:id/stats` (existing endpoint, 30-day average of successful
  runs): per-agent `avg_duration_ms` and `avg_cost_usd`. An agent with no
  successful runs in that window (shall) show "no estimate yet" instead of a
  number. (Q-9)

  Traces: US-1, US-2. Verify: component - an agent fixture with zero
  successful runs renders "no estimate yet"; one with history renders its
  stats-endpoint values formatted as `Xs · $Y`.
- **AC-12** — The combined estimate shown next to the run button (shall) be:
  total time = the maximum `avg_duration_ms` among selected agents with an
  estimate (they run in parallel, AC-14); total cost = the sum of
  `avg_cost_usd` among selected agents with an estimate. WHEN at least one
  selected agent has no estimate, the combined total (shall) be marked
  partial (e.g. "≥ $0.20 · 1 without history"). (Q-9)

  Traces: US-1, US-2. Verify: component - selecting 3 agents with estimates
  8.2s/$0.06, 7.4s/$0.05, 6.9s/$0.04 shows "≈ 8.2s · $0.15"; adding a 4th
  agent with no history marks the total partial.
- **AC-13** — The `/multi-agent-review/configure` screen (shall) show step 1
  "Pull request" (a PR selector) and step 2 "Agents to run" (card list, one
  per enabled agent, each showing name, icon, a one-line summary — the
  agent's latest successful run's summary on this PR if one exists, else the
  agent's description — and its AC-11 estimate), with a "Select all" control
  and the same combined-estimate button as AC-12. WHILE no PR is selected,
  step 2 (shall) render disabled with "Pick a pull request first". (Q-9)

  Traces: US-2. Verify: component - selecting a PR enables step 2 and
  populates the card list; the run button mirrors AC-9's limit and AC-8's
  single-agent routing.
- **AC-14** — WHEN the user clicks "Configure agents…" in the PR page picker
  (AC-7), the client (shall) navigate to `/multi-agent-review/configure` with
  the current PR already selected in step 1, not to the agents settings page.
  (Q-11)

  Traces: US-1, US-2. Verify: component - the link's target includes the
  current PR id as a query param, and Configure run renders it pre-selected.

### C. Execution: parallelism, states, retry, cancel

- **AC-15** — The multi-agent-run service (shall) start selected agents in
  parallel, bounded to 4 concurrent agent runs per multi-run. Agents beyond
  the bound (shall) start as `queued` and transition to `running` as a slot
  frees. (Q-1)

  Traces: US-3. Verify: integration - a multi-run of 6 agents against a
  mocked executor shows at most 4 `agent_runs` in `running` at any instant,
  with the remaining 2 `queued` until a slot opens.
- **AC-16** — The multi-run's reported total wall-clock time (shall)
  approximate the time from its creation to its slowest child agent's
  completion — not the sum of per-agent times. (Q-1, Q-16)

  Traces: US-3, US-10. Verify: integration - 3 mocked agents with durations
  2s/3s/5s report a multi-run total close to 5s, not 10s.
- **AC-17** — A failure in one child agent run (shall) leave the other child
  runs unaffected: they continue, complete, and their findings remain fully
  available. The parent `MultiAgentRun`'s aggregate status (shall) reflect
  "partial" when at least one child failed and at least one succeeded.

  Traces: US-4. Verify: integration - with one of three mocked agents forced
  to throw, the other two reach `done` with their findings intact, and the
  parent status is `partial`, not `failed`.
- **AC-18** — Each `AgentColumn` (shall) carry one of `queued | running |
  done | failed | cancelled` (AC-4), updated live via the existing per-run
  event stream (`GET /runs/:id/events`) and reflected in both view modes.
  (Q-13)

  Traces: US-3. Verify: component - a column transitions queued → running →
  done as mocked events arrive, independent of the other columns' states.
- **AC-19** — The user (shall) be able to cancel one agent (its column shows
  `cancelled`, the others unaffected) or cancel the whole multi-run (every
  non-terminal child moves to `cancelled`). The user (shall) additionally be
  able to retry a single `failed` agent: this re-runs only that agent within
  the same `multi_agent_runs` parent (new attempt replaces the failed
  column's content; other columns are untouched). (Q-13 — user chose to add
  retry, not the agent's own "cancel-only" recommendation)

  Traces: US-4, US-9. Verify: integration - cancelling one `running` agent
  moves only its column to `cancelled`; retrying a `failed` agent produces a
  `done` or `failed` column again without touching sibling columns' finding
  lists or timestamps.

### D. Grouping and "Where agents disagree"

- **AC-20** — The server (shall) group two findings from different agents of
  the same multi-run into the same similarity group when they are in the
  same file and their line ranges overlap. A finding belongs to at most one
  group. The threshold is fixed, not configurable, in v1. (Q-3)

  Traces: US-5. Verify: unit - findings at `file.ts:10-14` and `file.ts:12-18`
  from two agents group together; a third at `file.ts:40-42` does not join
  either group; a finding touching two others' ranges joins only the first
  group it matches, never both.
- **AC-21** — Grouping (shall) never alter or drop an original finding: its
  text, severity, confidence, suggested fix and authoring agent remain
  exactly as that agent produced them. Each grouped finding only gains a
  `group_id` (AC-4). (Q-3, Q-5)

  Traces: US-5. Verify: unit - a finding's full fields before and after
  grouping are byte-identical except for the added `group_id`.
- **AC-22** — In `Columns` view, a grouped finding (shall) show a badge
  "also flagged by: <agent names>" listing the other agents sharing its
  group. In `Tabs + detail` view, a grouped finding's detail (shall) include
  a "Similar findings" section listing each other group member's agent,
  severity and unmodified original title/body. (Q-8)

  Traces: US-5, US-7. Verify: component - a 3-way group renders the badge
  with 2 other agent names in Columns, and the full "Similar findings"
  section with 2 entries in Tabs + detail.
- **AC-23** — A location (file + line range, same overlap rule as AC-20) is a
  **conflict** when, among the agents that actually ran in this multi-run:
  at least one agent flagged it and at least one other agent did not flag it
  ("did not flag" vs. any verdict), OR two agents flagged it with different
  severities. A location where every participating agent agrees (all flag it
  the same way, or none flag it) is not a conflict. (Q-5)

  Traces: US-6. Verify: unit - {Security: warning, Performance: did-not-flag}
  is a conflict; {Security: warning, Performance: warning} is not; {Security:
  warning, Performance: suggestion} is a conflict (different severities).
- **AC-24** — The "Where agents disagree" block (shall) list, per surfaced
  location, one column per agent that participated in this multi-run,
  showing that agent's verdict (severity + its own text) or "did not flag"
  with no synthesized reason text (no source exists for one — Q-6). An agent
  that failed or was cancelled for this run (shall) never show "did not
  flag"; it shows "failed, no verdict" / "cancelled" instead. (Q-6, Q-7)

  Traces: US-6. Verify: component - a 4-agent run where one agent failed
  renders that agent's cell as "failed, no verdict", never as "did not
  flag", at every location.
- **AC-25** — The "Show only conflicts" toggle (shall), when off, list every
  location flagged by at least one participating agent (agreement and
  conflict alike); when on, list only locations meeting the AC-23 conflict
  rule. (Q-5)

  Traces: US-6. Verify: component - toggling on a fixture with 2 agreement
  locations and 1 conflict location leaves only the conflict location
  visible; toggling off restores all 3.

### E. Results page: Columns and Tabs + detail

- **AC-26** — The results page header (shall) read
  `"N agents · parallel fan-out · Xs total · $Y"`, where N is the count of
  participating agents, X is the AC-16 wall-clock total, and Y is the sum of
  known per-agent actual costs, marked "partial" if any child's cost is not
  yet known (still running or failed before pricing). (Q-16 — the
  screenshots' "fan-out via worktrees" does not match the real mechanism and
  is not used.)

  Traces: US-3. Verify: component - a run with one still-running agent shows
  "$Y partial"; a fully completed run shows a plain total.
- **AC-27** — A `Columns | Tabs` toggle (shall) switch the results page
  between the two layouts without losing scroll position of findings already
  open, and the chosen mode (shall) persist across a reload of the same run
  URL (AC-2) for that browser session.

  Traces: US-7. Verify: component - switching modes and reloading the page
  keeps the last-chosen mode.
- **AC-28** — `Columns` view (shall) render one column per participating
  agent, each with: circular score indicator, time/cost, its finding list
  (title + `file:line`, AC-22 badge where grouped), a findings count, and a
  "View trace" link opening `RunTraceDrawer` (AC-31) scoped to that agent's
  own `agent_runs` id. WHILE an agent's column is `running`, it (shall)
  additionally render a compact `LiveLogStream` fed by that agent's own
  event stream.

  Traces: US-3, US-7. Verify: component - 4 agent fixtures in mixed states
  render 4 independent columns, each `View trace` opening the correct
  agent's trace.
- **AC-28a** — Every "View trace" affordance in Multi-Agent Review (the
  `Columns` column footer, AC-28; the `Tabs + detail` summary card header,
  AC-29) (shall) open the *same* `RunTraceDrawer` component used by the
  existing single-agent `agent_runs` detail view, unmodified apart from
  AC-31's addition — same `Trace` tab (Configuration / Stats / Prompt
  assembly / Tool calls / Raw output sub-views) and `Live log` tab
  (`LiveLogStream` over SSE via `useRunEvents`), same "Copy raw output"
  footer action. The drawer is scoped to the one `agent_runs` id of the
  column/tab it was opened from — it never shows another agent's data, and
  it is not a cut-down or logs-only variant built for this feature.

  Traces: US-3, US-7. Verify: component - opening the drawer from a
  multi-agent column renders the same `Trace`/`Live log` tab pair and footer
  button as opening it from the single-agent `agent_runs` page for an
  equivalent run.
- **AC-29** — `Tabs + detail` view (shall) render one tab per participating
  agent (name + score), and the active tab's panel (shall) render that
  agent's summary card — including the same "View trace" link as AC-28,
  opening `RunTraceDrawer` (AC-31) scoped to that agent — followed by its
  findings, each showing severity icon, title, category tag, `file:line`,
  confidence %, description, and a "SUGGESTED FIX" block when
  `suggested_fix` is present.

  Traces: US-7. Verify: component - selecting a tab renders only that
  agent's findings, with a "View trace" link in the summary card that opens
  the correct agent's trace; a finding with no suggested fix omits the block
  instead of rendering it empty.
- **AC-30** — The "Where agents disagree" block (AC-23–AC-25) (shall) appear
  below the findings in both `Columns` and `Tabs + detail` views, identical
  in content and toggle state between the two.

  Traces: US-6, US-7. Verify: component - toggling "Show only conflicts" in
  Columns mode and switching to Tabs mode preserves the toggle's state.
- **AC-31** — `RunTraceDrawer`, opened from any agent column/tab, (shall)
  additionally render the structured grounding-drop list persisted per
  AC-32: each dropped finding's title, `file:lines` and drop reason,
  alongside the existing token/cost summary it already shows. (Q-4)

  Traces: US-3. Verify: component - a trace fixture with 2 grounding-dropped
  findings renders both with their reasons, in addition to the existing
  pass/fail summary line.
- **AC-32** — The server (shall) persist, per `agent_runs` row, the
  structured list of findings the grounding gate dropped (title,
  `file:lines`, reason), computed at grounding time, so it survives for
  `GET /runs/:id/trace` to serve. (Q-4)

  Traces: US-3. Verify: integration - a run whose grounding gate drops 2
  findings has both present (title, lines, reason) in a later
  `GET /runs/:id/trace` call, including after the process restarts.
- **AC-33** — Each finding's action row in `Tabs + detail` (shall) show
  `Accept`, `Dismiss`, `Turn into eval case` — each calling the existing
  single-review endpoints unchanged, with `Turn into eval case` still 422ing
  `undecided` until Accept/Dismiss has run — and (shall) hide `Learn` and
  `Reply to author` entirely (no disabled button; both are out of scope,
  AC-33). (Q-14)

  Traces: US-8. Verify: component - the action row renders exactly 3
  buttons; `Learn` and `Reply to author` are absent from the DOM, not merely
  disabled.
- **AC-34** — Accept/Dismiss/Turn into eval case on one grouped finding
  (shall) only change that finding's own state; sibling findings in the same
  similarity group (different agents, AC-20) (shall) remain in their prior
  state. (Q-14)

  Traces: US-8. Verify: integration - accepting one grouped finding leaves
  the group's other members (from other agents) still `pending`.

### F. Navigation, concurrency guard, access

- **AC-35** — Each `MultiAgentRun` (shall) have its own URL
  (`/multi-agent-review/:runId`) that, reloaded, re-renders the same run via
  `GET /multi-agent-runs/:runId` (AC-2), live state included. (Q-15)

  Traces: US-3, US-7. Verify: component - reloading mid-run shows the
  then-current statuses, not the statuses at the moment of the first load.
- **AC-36** — A "Multi-Agent Review" item (shall) be added to the sidebar's
  `GLOBAL` group, pointing at `/multi-agent-review`, and the PR page (shall)
  link to the PR's most recent multi-run (via AC-3) where one exists.
  (Q-15)

  Traces: US-1, US-3. Verify: component - the sidebar renders the new item in
  the `GLOBAL` group; a PR with a prior multi-run shows a link to it.
- **AC-36a** — `/multi-agent-review`, landed on directly (no PR or run in
  the URL), (shall) render the design's empty state for zero enabled
  agents — `Multi-Agent · no agents` in `design/DevDigest Design
  (standalone) (4).html`: icon, "Enable agents to run reviews", "Multi-agent
  review runs the PR through every enabled agent in parallel. You have no
  agents enabled yet.", and a "+ Go to Agents" button to `/agents` — WHEN
  the workspace has zero enabled agents. WHEN it has one or more enabled
  agents, it (shall) instead redirect to Configure run (AC-9). It is not a
  list of past multi-runs: the design has no such state for this page, and
  this spec does not add one. (Q-15, resolved 2026-10-17 against the design
  file)

  Traces: US-1. Verify: component - zero enabled agents renders the design's
  empty state with a working "Go to Agents" link; one or more enabled
  agents redirects to Configure run instead of rendering a list.
- **AC-37** — WHEN a multi-run is started for a PR that already has a
  non-terminal (`queued`/`running`) multi-run, `POST /pulls/:id/multi-agent-run`
  (shall) respond `409 Conflict` and create nothing. (Q-15)

  Traces: US-1. Verify: integration - a second `POST` while the first run is
  still `running` returns 409 and the `multi_agent_runs` table gains no new
  row.
- **AC-38** — `POST /pulls/:id/multi-agent-run`, `GET /multi-agent-runs/:id`
  and `GET /pulls/:id/multi-agent` (shall) return `404` when the resource
  belongs to a different workspace than the requester's, matching the
  access-check pattern used by other PR-scoped routes in this module. (Q-19)

  Traces: US-1. Verify: integration - a workspace-B token requesting a
  workspace-A multi-run id gets 404, not the record.

## Edge cases

- **Zero agents enabled.** The picker (AC-7, AC-13) shows an empty state
  ("No agents enabled — enable one in Settings → Agents") instead of an
  empty checkbox list, and the run button stays disabled.
- **PR list fails to load in Configure run.** Step 1 shows a retry affordance;
  step 2 stays in its "pick a PR first" disabled state.
- **Stats endpoint fails.** The picker (shall) still render and allow
  selection; every estimate falls back to "no estimate yet" (AC-11) rather
  than blocking the picker.
- **Event stream drops mid-run.** The results page (shall) fall back to the
  existing polling mechanism (`GET /pulls/:id/runs/active`) for column status,
  consistent with how the single-agent run view already degrades.
- **Trace requested before it is persisted** (the known race from
  `server/INSIGHTS.md`: status is written before the trace). `View trace`
  immediately after a column reaches `done` (shall) show a brief "trace not
  ready yet" state and retry once, rather than a hard error — same handling
  as the existing single-run `RunTraceDrawer` already needs.
- **All agents fail.** The results page (shall) still render (every column
  `failed`), the header cost (shall) show `$0` marked partial, and the
  "Where agents disagree" block (shall) render empty with an explanatory
  line ("no agent produced a verdict") rather than hiding itself.
- **Zero findings from a successful agent.** Its column/tab (shall) show a
  "No findings" state distinct from `failed`.
- **Very long titles or file paths.** Column and tab finding rows (shall)
  truncate with the full text available on hover/focus (title attribute or
  equivalent), not overflow the layout.
- **More agents than fit on screen (Columns view).** The column row (shall)
  scroll horizontally rather than wrap or shrink columns below a usable
  width; `Tabs + detail` view is the recommended mode past roughly 5 agents,
  but no agent count is blocked from `Columns`.
- **Small screens.** Both view modes (shall) remain usable at common
  viewport widths used elsewhere in the client (no separate mobile layout is
  promised beyond what the rest of the studio UI supports).
- **A finding's group spans more than 2 agents.** The AC-22 badge (shall)
  list all other group members, not just one; "Similar findings" (shall)
  list every other member.
- **Retry racing a cancel.** Retrying a `failed` agent while a run-wide
  cancel is in flight (shall) be rejected (the retried agent moves straight
  to `cancelled`, not `running`), since a run-wide cancel takes precedence.

## Non-functional requirements

- **NFR-1 — Honest 1-vs-3 benchmark (Q-17).** Validation for this feature
  (shall) run the same seeded PR (#482-equivalent in the demo dataset) with
  3 named agents, under two configurations: 1 agent, and all 3 agents via
  multi-agent-run. Each configuration (shall) be run 3 times; the reported
  figure per metric is the **median** of the 3 runs. Metrics: wall-clock
  time, total input/output tokens, total cost, findings count. The
  validation report (shall) record the raw per-run numbers and the resulting
  ratio with **no adjustment toward an expected 3×** — any deviation from a
  naive 3× (prompt caching, shared diff preparation across agents, differing
  response lengths) is noted as an explanation, not smoothed away.
- **NFR-2 — Rate limiting (Q-18).** One `POST /pulls/:id/multi-agent-run`
  call counts as a single request against the existing rate limit (10/min)
  — it does not multiply by the number of agents requested. Each child
  agent run keeps the existing single-run executor timeout; the parent
  multi-run has no separate timeout beyond its children's.
- **NFR-3 — Partial-failure tolerance (already true, restated as a
  requirement here).** No code path in the multi-agent-run service may let
  one child agent's exception reach or affect a sibling child's execution or
  recorded result (AC-17).
- **NFR-4 — Access control (Q-19).** Every new multi-agent route performs a
  workspace check (AC-38); this is a hard requirement for new code even
  though the pre-existing `GET /runs/:id/trace` lacks one (see Out of
  scope).
- **NFR-5 — Accessibility.** Checkboxes in the picker carry accessible
  labels that include the agent name and its estimate text. The
  `Columns`/`Tabs` toggle is exposed as a pressed-state button group (not
  bare divs). Live column status changes are announced via a polite
  live region, not only by color. The "Show only conflicts" control is
  exposed as a switch with an accessible name. Severity is conveyed by icon
  + text label, never by color alone (matching existing severity rendering
  elsewhere in the client).
- **NFR-6 — Convention compliance.** New server code follows the
  `routes.ts → service.ts → repository.ts` split per `server/AGENTS.md`
  (a new `src/modules/multi-agent-run/` module) and Zod-typed
  request/response schemas via `fastify-type-provider-zod`. New client
  components follow the `_components/<ComponentName>/` PascalCase-folder
  convention per `client/AGENTS.md`. Drizzle columns use explicit
  `camelCase` TS ↔ `snake_case` SQL mapping (e.g. `multiAgentRunId` →
  `multi_agent_run_id`).

## Provenance and attribution of findings

- A finding's `agent_run_id` / authoring agent is never reassigned or
  erased by grouping (AC-21) — grouping only adds a `group_id` pointer.
- A dismissed, accepted, or eval-cased finding keeps the original agent
  attribution in its own record; acting on it never acts on its group
  siblings (AC-34).
- "Where agents disagree" (AC-24) attributes every verdict shown, including
  "did not flag"/"failed, no verdict", to the specific agent that did or did
  not produce it in *this* multi-run — never to an agent that was not
  selected for this run (AC-24, fixing the screenshot inconsistency per
  Q-7).

## Untrusted inputs

- `agent_ids[]` in `POST /pulls/:id/multi-agent-run` — validated against the
  workspace's actual enabled agents server-side (unknown or disabled ids
  rejected with 422), never trusted from the client beyond that check
  (AC-9's 8-agent cap is also enforced server-side, not just in the picker
  UI).
- Model-produced finding text (title, rationale, suggested fix) flowing into
  the grouping and conflict logic (AC-20–AC-25) is treated as display data
  only — grouping/conflict decisions are computed from structural fields
  (`file`, line range, `severity`), never by re-parsing or trusting
  model-authored free text as a location signal.
- Per the existing grounding gate (unchanged by this spec), every finding
  entering a multi-run's results must still cite a real diff line or it is
  dropped (and now recorded per AC-32) before it ever reaches grouping or
  disagreement logic.

## Out of scope

- **`ci/` and `agent-runner/`** — not touched by this spec. `ci/` does not
  exist in this worktree; `agent-runner/` is the CI runner package owned by
  a different worktree/team. No route, type, or file under either is added,
  renamed or imported by anything in this spec.
- **Review execution itself** (prompting, single-agent grounding/scoring
  logic) is not re-described, beyond making it run inside a bounded parallel
  fan-out (AC-15–AC-19) and feeding a grounding-drop list into the trace
  (AC-32).
- **Fixing `GET /runs/:id/trace`'s missing workspace check** — a known,
  separate pre-existing gap (see Current state). Only the new multi-agent
  endpoints are required to check workspace in this spec (AC-38, NFR-4).
- **`Learn` and `Reply to author`** — hidden, not built (AC-33).
- **A configurable grouping-similarity threshold** — fixed rule only
  (AC-20).

## Open questions

None outstanding on product behavior — all 19 questions raised during spec
creation were resolved by the user on 2026-10-16 (Q-1…Q-19, cited inline per
AC above), and the one behavior left open after that (the
`/multi-agent-review` landing state) was resolved on 2026-10-17 against
`design/DevDigest Design (standalone) (4).html` — see AC-36a.

One implementation-level detail remains, flagged for the **implementation
planner**, not as an open product question:

1. The exact concurrency primitive for AC-15's bound-of-4 fan-out (e.g. a
   small in-process queue vs. reusing whatever primitive the executor
   already has for other bounded work) is an implementation choice, not a
   product requirement — the planner should pick based on what
   `run-executor` already exposes.

## Implementation notes for the planner (simplicity bias, non-binding)

None of these change any AC above — they are the user's explicit preference
for the *simplest* implementation that still satisfies every AC, offered as
a starting bias the planner should confirm or override once it has read the
actual code:

- **AC-15/18 concurrency** — prefer a small in-process semaphore (e.g. an
  array of in-flight promises bounded to 4) directly in the
  `multi-agent-run` service, calling the existing single-agent execution
  path N times, over introducing a queue library or a new scheduling
  abstraction.
- **AC-20–25 grouping/conflicts** — prefer computing groups and conflicts on
  read, as a pure function over one run's findings inside the `GET`
  endpoint, over persisting groups or running them as a background job. The
  rule is fixed and run sizes are small (≤8 agents), so there is no
  performance case for precomputing or storing this.
- **AC-31/32 grounding-drop list** — prefer one JSON column on `agent_runs`
  (or extending the existing trace blob) over a new normalized table with a
  foreign key, unless the planner finds the existing trace storage doesn't
  fit structured data well.
- **AC-19 retry** — prefer modeling a retry as a new child `agent_runs` row
  under the same `multi_agent_runs` parent, marking the prior attempt
  superseded, and reusing the existing single-agent execution path — not a
  separate retry code path.
- **Columns vs. Tabs + detail (AC-28/AC-28a/AC-29)** — prefer one shared
  data hook (one fetch/subscribe to run state) with two thin presentational
  components over duplicating fetch or live-update logic per view.
- **AC-36a landing page** — already the simplest option in the design (an
  empty-state or a redirect, never a list); no further simplification
  needed here.
