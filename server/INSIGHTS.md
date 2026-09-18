# Insights — server/

Durable findings discovered while working in this package that aren't
obvious from the code or `README.md`. Append-only: correct a stale entry
with a dated note beneath it rather than editing it away. Sections are
fixed — add to the one that fits, never invent a new heading. Written and
read by the `engineering-insights` skill.

## Decisions

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-09-18** — `server/src/modules/pulls/status.ts` already has a
  unit-tested `rollupSeverities`/`SeverityCounts` aggregator, but it's
  deliberately not wired into any route — `server/src/modules/pulls/
  routes.ts:114-120` has a comment stating the severity breakdown is
  intentionally not surfaced on the PR list. Read that comment before
  wiring severity counts into the list endpoint. **Fixed 2026-09-18**:
  wired into `GET /repos/:id/pulls` as `PrMeta.findings` (see
  `server/src/modules/pulls/routes.ts:153-176`) — the "not surfaced"
  comment no longer exists at that location.
- **2026-09-18** — The PR list's "latest review" columns (`GET
  /repos/:id/pulls`) are computed by one `IN`-query against `reviews`,
  ordered `desc(createdAt)`, first-seen-per-PR in JS — not a DB aggregate. A
  new metric that must come from the SAME run as an existing one (e.g. score)
  should `leftJoin` onto that same query via `reviews.run_id →
  agent_runs.id`, not add a second "latest by `agent_runs.ran_at`" lookup —
  the two can point at different runs when the newest run failed after an
  earlier successful review. `server/src/modules/pulls/routes.ts:120-131`.
  **Correction 2026-09-18**: this "same run as score" rule does NOT apply to
  the list's `cost_usd` column — that was changed to SUM every successful
  (`status='done'`) run's cost across the whole PR (a grading-rubric
  requirement), queried directly off `agent_runs.pr_id`, deliberately
  decoupled from the score/latest-review query. `server/src/modules/pulls/
  routes.ts:133-150`.

## Tool & Library Notes

## Recurring Errors & Fixes

- **2026-09-18** — Adding a field to `reviewer-core`'s `ReviewOutcome` return
  type does not guarantee it reaches the DB: `run-executor.ts` destructures
  the outcome by name right before persistence, so a new field is silently
  dropped with no typecheck error (the destructuring just narrows, it
  doesn't require exhaustiveness). Grep the destructuring assignment before
  trusting a new outcome field is actually persisted:
  `server/src/modules/reviews/run-executor.ts:213`.

## Session Notes

## Open Questions
