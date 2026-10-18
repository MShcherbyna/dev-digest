# Insights — client/

Durable findings discovered while working in this package that aren't
obvious from the code or `README.md`. Append-only: correct a stale entry
with a dated note beneath it rather than editing it away. Sections are
fixed — add to the one that fits, never invent a new heading. Written and
read by the `engineering-insights` skill.

## Decisions

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-10-12** — `@devdigest/ui` `ErrorState` hard-codes the English "Retry"
  label (`src/vendor/ui/primitives/ErrorState.tsx`), so it cannot satisfy a
  "every label from `messages/`" rule. The PR Brief's inline failure line is
  therefore its own `PrBriefBlock/_components/BriefError` (Button + `panel.retry`).
  Related: `DiffTab` now calls `useTranslations("brief")` eagerly, so its
  tests must provide the `brief` namespace (else an `IntlError` is logged, the
  test still passes).

- **2026-10-02** — Resync completion is the index state's `updatedAt`
  advancing, not `POST /repos/:id/resync` returning (it is 202 and returns
  before reindexing) and not `lastIndexedSha` (unchanged when a failed index is
  redone on the same commit). `useResyncAndRefresh`
  (`src/lib/hooks/repo-intel.ts`) polls `useRepoIntelStatus` until it changes
  (120 s cap) and then invalidates `queryKeys.prBlastAll()`. Prior-PR history
  uses `prBlastHistory`, deliberately outside the `pr-blast` prefix so a
  resync does not re-hit GitHub.

- **2026-09-24** — `client/src/lib/feature-models.ts` is a hand-mirrored copy
  of `FEATURE_MODELS` (the client can't import shared runtime values) and it
  has already drifted: `review_intent` is `openai/gpt-4.1` there but
  `openrouter/deepseek/deepseek-v4-flash` in
  `server/src/vendor/shared/contracts/platform.ts`, so Settings shows the
  wrong "default" model for that row. A new feature model must be added to
  BOTH vendored `contracts/platform.ts` copies and this file; diff them:
  `diff server/src/vendor/shared/contracts/platform.ts client/src/vendor/shared/contracts/platform.ts`.

- **2026-09-18** — The PR list has no "Findings" column live in
  `PRRow.tsx`/`constants.ts` (`COLUMN_KEYS` has no `findings` entry) even
  though design screenshots show one — but a matching unused type,
  `PrRowView.findings: { CRITICAL, WARNING, SUGGESTION }`, already sits at
  `client/src/lib/types.ts:37-48` with zero other references. Before
  building a findings-count UI, check for this kind of pre-staged
  dead type/view-model instead of inventing a new shape.
- **2026-09-18** — No Popover/Tooltip primitive exists anywhere under
  `src/vendor/ui/kit/` (only `Modal.tsx`, `Drawer.tsx`, `Dropdown.tsx`).
  `Dropdown.tsx` is the closest analog but is click+outside-click only, no
  hover support — any hover-triggered UI has to be built from scratch: hover
  uses `onMouseEnter`/`onMouseLeave` state, click uses a separate "pinned"
  state ORed with hover so either can open it, and the outside-click/
  Escape-close effect only attaches while pinned (mirrors `Dropdown.tsx`'s
  pattern but gated). **Moved 2026-09-18** into a shared presentational
  component once a second consumer needed the identical severity-breakdown
  popover (PR list AND the PR detail page's Agent-runs Timeline row) — now
  `pulls/_components/SeverityFindingsBreakdown/SeverityFindingsBreakdown.tsx`
  (pure: takes `counts`/`findings` as props, no data-fetching of its own;
  `FindingsSummary.tsx` and `RunHistory.tsx` are now thin callers that only
  differ in how they source that data — one lazy-fetches via `usePrReviews`
  on open, the other already has it from a `reviews: ReviewRecord[]` prop).

- `client/src/vendor/ui/nav.ts` was edited locally (not at the sync source) to
  add the SKILLS LAB group (Agents, Skills, Conventions) — port it to the sync
  source or the next re-vendor will revert it. **Refined 2026-10-11:** a second
  local edit adds the WORKSPACE "Project Context" item (`key: "context"`, icon
  `Folder`, no `gKey`); `activeKeyFor` and `shell.nav.context` already existed.
  **Refined 2026-10-15:** a third local edit adds the WORKSPACE "Eval
  Dashboard" item right after "Project Context" (`key: "eval"`, icon `Gauge`,
  href `/eval`, no `gKey`); `activeKeyFor` (`/eval*`) and `shell.nav.eval`
  already existed.
  Port all three edits to the sync source.
  **Refined 2026-10-17:** a fourth local edit (GLOBAL section, "Multi-Agent
  Review" item, `key: "multi-agent"`, icon `Users`, href `/multi-agent-review`,
  no `gKey`) was pre-approved by the implementation plan (Q-5) but could NOT be
  applied in an `implementer`-driven session: `.claude/hooks/implementer-guard.sh`
  matches any `client/src/vendor/ui/` path unconditionally and blocks the
  `Edit`/`Write` tool call (exit 2) regardless of what the plan or a prior
  agent message says — a plan's/user's written approval for a vendored-path
  edit is not itself a bypass for this hook. The edit still needs doing: either
  at the sync source in the main (non-worktree) checkout, or by a session not
  running under the `implementer` agent's guard.
  **Refined 2026-10-17:** a fourth local edit adds a GLOBAL group with "CI Runs"
  (`key: "ci-runs"`, icon `Workflow`, href `/ci-runs`); applied by the main
  session with user sanction (Export to CI, D-1/D-4); `activeKeyFor` and
  `shell.nav.ci-runs` already existed. Port all four edits to the sync source.
- Conventions confidence bar turns amber below `CONFIDENCE_WARN_BELOW` (0.85,
  `ConventionCard/constants.ts`): the design shows 90% neutral and 80% amber.

- **2026-10-16** — `EvalCaseButton`'s "Turn into eval case" no longer posts on
  click: it fetches a no-persist draft (`useEvalCaseDraftFromFinding`,
  `GET /findings/:id/eval-case/preview`) and the finding's `Agent`
  (`useAgent`), then opens `EvalCaseModal` (cross-route import from
  `app/agents/.../EvalCaseModal`, same pattern as `RunHistory` ->
  `SeverityFindingsBreakdown`) with `draft`/`findingId`/`prId` props. In that
  mode the modal's Diff and PR-meta tabs render read-only (new `readOnly` prop
  on `DiffInput`/`PrMetaInput` — the vendored `Textarea` has no `readOnly`, so
  `PrMetaInput`'s body falls back to a plain `<div>` when read-only); Name and
  Expected output stay editable and are sent as an override body on
  `POST /findings/:id/eval-case`. A 409 race (case already created elsewhere)
  is treated as success (closes + `onSaved`), matching the old button's
  behavior. `EvalCaseModal.tsx`, `EvalCaseButton.tsx`.

## Tool & Library Notes

- **2026-10-17** — `src/test/render-intl.tsx` was missing the `runs` namespace
  (`messages/en/runs.json`) even though most of Multi-Agent Review
  (`AgentColumn`, `TabsView`, `DisagreementBlock`, `MultiAgentRunView`,
  `ConfigureRunView`, `MultiAgentLanding`) calls `useTranslations("runs")` —
  every key rendered literally (`"runs.configure.step2"`) instead of throwing,
  so the failure only shows up as a text-match miss, not an intl error. Added
  `runs` to the provider's `messages` object; any new `renderWithIntl` test
  for a `runs`-namespaced component needs this import. Also two more RTL
  query traps alongside the existing `Tabs`/`ToastProvider` ones: the vendored
  `Checkbox` is a `<button role="checkbox" aria-checked>` (query via
  `getByRole("checkbox", { name })`) and `Toggle` is a bare
  `<button role="switch" aria-checked>` with **no** accessible name (the label
  is a sibling `<span>`, not `aria-label`/`aria-labelledby`) — query it via
  `getByRole("switch")` without `{ name }`.
  **Refined 2026-10-17 (multi-agent-review-01x94 NFR-5 fix):** the vendored
  `Checkbox`'s own `<label>` wraps only its `role="checkbox"` button plus its
  `label` prop content — any sibling text rendered *outside* that `<label>`
  (e.g. a `<span>` next to `<Checkbox>` in the same row) is excluded from the
  checkbox's accessible name even though it's visually adjacent; move it
  inside the `label` prop instead. The same fix works for the bare `Toggle`
  (no `aria-label` prop at all): since `<button>` is an HTML "labelable"
  element, wrapping `<Toggle>` + its text in a plain `<label>` at the call
  site gives it an accessible name with no vendor change — see
  `DisagreementBlock.tsx`'s "Show only conflicts" row. Gotcha when adding a
  wrapping element for layout (e.g. to stretch the `<label>` to full width so
  trailing text can right-align): use a `<span style={{ display: "block" }}>`,
  not a `<div>`, if any test does `el.closest("div")` to reach an ancestor —
  an extra `<div>` becomes the new nearest match and breaks that lookup
  (`AgentPicker.test.tsx`'s "Up to 8 agents per run" title assertion).

- **2026-10-15** — Focus-return tests need manual focus/blur: the `fireEvent`
  `userEvent.click` shim never focuses the target, and jsdom does not blur a
  button that becomes disabled/loading (browsers do). To reproduce the "trigger
  lost focus before the modal mounted" bug, `btn.focus()` before the click and
  `btn.blur()` after it. See `AgentEvalDashboardView.test.tsx` (B-3 test).

- **2026-10-14** — Two RTL query traps in component tests: the vendored
  `@devdigest/ui` `Tabs` renders plain `<button>`s (no `role="tab"`), so use
  `getByRole("button", { name })`; and `ToastProvider` always mounts a
  `role="status"` live region, so `getByRole("status")` is ambiguous in any
  `renderWithIntl` test — scope it, e.g. `within(screen.getByRole("dialog")).getByRole("status")`.
  See `EvalCaseModal.test.tsx`.

- **2026-10-12** — Testing code that calls the module-level `notify.*`
  (`src/lib/toast.tsx`, e.g. `DiffTab`'s "File not in this PR's diff" mount
  effect) under `renderWithIntl`: `ToastProvider` registers its pusher in an
  effect, and child effects run BEFORE the parent's, so a component that
  toasts on its first commit toasts into the void (the test finds no text).
  Mount it one commit late (`useEffect(() => setLate(true), [])` harness), as
  the app does. Also, the `rerender` returned by `renderWithIntl` drops the
  providers (RTL only re-wraps with the `wrapper` option) — drive re-renders
  with a state-holding harness instead.

- **2026-10-12** — `vitest run <path>` treats its argument as a regex filter,
  so a path with the Next dynamic-route brackets (`pulls/[number]/...`)
  silently matches nothing or the wrong files (it ran just
  `diff-viewer/findings.test.ts`). Filter by base name instead:
  `npx --yes pnpm@10 exec vitest run VerdictBanner DiffTab SmartDiffGroups`.

- **2026-09-19** — ESLint (flat config, `eslint.config.mjs`, `pnpm lint`) was
  added; before that `client/` had none, yet the code carried
  `eslint-disable react-hooks/exhaustive-deps` comments. `pnpm add` of
  `eslint-config-next` exits non-zero with `ERR_PNPM_IGNORED_BUILDS`
  (`unrs-resolver`) but the install itself succeeded and lint works — don't
  chase it. Never run `next build` in `client/` while `pnpm dev` is up (both
  use `.next`); build a `rsync`ed copy with `node_modules` symlinked instead.

- **2026-09-20** — `@testing-library/user-event` is NOT a client dependency
  (only `@testing-library/react` + `jest-dom`), and lockfiles are do-not-touch,
  so component tests use the `fireEvent`-based shim `src/test/user.ts`
  (`click`/`type`/`clear`/`upload`; `type` appends in one change event) and
  `src/test/render-intl.tsx` (`skills` + `agents` messages + ToastProvider).
  In a fresh git worktree there is no `node_modules`: symlink the main
  checkout's, run `npx tsc --noEmit` / `npx vitest run` / `npx eslint src`
  directly (`pnpm <script>` re-runs install and fails on ignored builds, and
  drops a stray `pnpm-workspace.yaml` you must not commit).

## Tool & Library Notes

- **2026-10-17** — Passing next-intl's `t` into a plain (non-component)
  `helpers.ts` function as a parameter needs
  `t: ReturnType<typeof useTranslations>` (imported as a type-only import from
  `next-intl`) — a hand-written signature like
  `(key: string, vars?: Record<string, unknown>) => string` fails `tsc` with
  `Types of parameters 'values' and 'vars' are incompatible` because next-intl's
  real `values` param type (`TranslationValues`) isn't a supertype of
  `Record<string, unknown>`. See
  `app/multi-agent-review/[runId]/_components/MultiAgentRunView/helpers.ts`
  (`headerMeta`).

## Recurring Errors & Fixes

- **2026-10-17** — `fireEvent.click` on a `disabled` radio still fires React's
  `onChange` in jsdom (browsers do not), so a "cannot be selected" test passes
  only if the handler itself guards on `disabled`. `RadioOption.tsx`.
- **2026-10-15** — A modal that mounts after an async step (e.g. Compare
  fetch) restores focus to `<body>` on close: `useFocusTrap` captures
  `document.activeElement` at mount, by which time the busy trigger button
  is disabled/blurred. Capture the trigger on click into a ref and pass
  `returnFocusTo` to `AccessibleModal`. `AgentEvalDashboardView.tsx`
- **2026-10-15** — Eval case rows stayed stale after a run finished: the
  per-run detail query (`useEvalRun`) is `enabled` only while a run is
  "running", so once disabled it never reports the terminal status and
  cannot trigger the final refetch. Drive terminal detection from the run
  LIST query (`useAgentEvalRuns`) and invalidate the case list there.
  `client/src/lib/hooks/eval.ts:317`

- **2026-09-18** — Loading a `/repos/:repoId/pulls...` URL directly (full
  page navigation, not an in-app click) shows "No repo selected" even
  though the repo exists in the DB — the selected-repo state isn't restored
  from the URL on a fresh load. Land on `/` (or click the repo in the
  sidebar) first and let the app's own client-side redirect restore
  selection, then navigate — relevant whenever browser-testing this app by
  deep-linking rather than clicking through.
  **Note 2026-09-19 (not reproduced as a persistent bug):** `repo-context.tsx`
  takes `repoId` from the URL path, and `useRepoNotFound` stays `false` until
  `/repos` has loaded. The text "No repo selected" also appears as the
  *placeholder* in the vendored `ui/shell/RepoSwitcher.tsx` whenever `active`
  is null — i.e. in the SSR HTML and until the repos query resolves — and the
  `RepoNotFound` empty state uses the same title. Likely that transient
  placeholder, not lost selection. Not confirmed in a real browser.

## Session Notes

## Open Questions
