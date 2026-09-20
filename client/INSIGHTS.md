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

## Tool & Library Notes

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

## Recurring Errors & Fixes

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
