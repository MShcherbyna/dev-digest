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

- **2026-09-20** — `assemblePrompt` unit tests for the reviewer-core prompt
  live in `server/test/prompt-*.test.ts` as well as `reviewer-core/test/`, and
  the server one imports the engine source through the path alias. Changing a
  `PromptParts` slot's type (e.g. `skills: string[]` → `{name, body,
  trusted}[]`) passes reviewer-core's own suite but breaks the server ones at
  runtime (`wrapUntrusted` got `undefined`). Grep before changing a slot:
  `grep -rn "assemblePrompt\|skills:" server/test reviewer-core/test`.

- **2026-09-20** — Skill "Restore" is roll-forward, not rollback:
  `POST /skills/:id/versions/:version/restore` calls the normal `update({body})`
  so it appends a new latest version. Restoring vN copies the body of v(N-1)
  (v3 → v4 = v2's text; v2 → v4 = v1's text); v1 is refused (422). Per-agent skill counts are a separate
  `GET /agents/skill-counts` (`{agentId: enabled count}`) rather than a field on
  `Agent`, because `vendor/shared` contracts are do-not-touch; register it
  before `/agents/:id`.

- Conventions extractor (`src/modules/conventions/`): the model's evidence is
  never trusted. `verifyEvidence` in `helpers.ts` re-reads the real file, drops
  a candidate when the file/line/quoted code can't be confirmed, and the card
  snippet comes from the file, not the model. Evidence paths are also checked
  with `isSafeRelativePath` (model output is untrusted, path traversal).
- `SkillCreate.source` (vendored) doesn't allow `'extracted'`, so conventions
  create skills through `SkillsRepository.insert` (which now takes optional
  `evidenceFiles`) instead of `SkillsService.create`.
- Re-scan wipes ALL of the repo's conventions (accepted included) and stores the
  fresh ones — deliberate product decision. `MockGitClient.readFile` returns
  `''` for unknown paths (real adapter throws), so sampling skips empty files.
- `'conventions'` feature model defaults to `openai gpt-5.4`; the extractor
  overrides that with `openrouter deepseek/deepseek-v4-flash` unless the
  workspace picked a model (`getFeatureModelOverride`). Real run on this repo:
  ~50s, 28 verified candidates.

## Tool & Library Notes

## Recurring Errors & Fixes

- **2026-09-24** — `*.it.test.ts` suites build `loadConfig(process.env)`, so
  `LocalSecretsProvider` reads the developer's REAL `~/.devdigest/secrets.json`
  (`secretsPath` = `homedir()`), and tests only override the LLM ids they name
  (`openai`/`anthropic`). Any new LLM call on the review path that defaults to
  another provider (intent layer → `openrouter`) makes a real network call on
  a machine with that key, blowing `waitForPrRuns`'s 10s (reviews.it.test.ts
  failed 3-4 of 6 tests); with no keys it fails open instantly and passes.
  Isolate to confirm: `HOME=<empty dir> env -u OPENROUTER_API_KEY -u GITHUB_TOKEN
  npx vitest run test/reviews.it.test.ts`. New review-path LLM/GitHub calls need
  a test-side override for that provider, or they flake per developer machine.

- **2026-09-18** — Adding a field to `reviewer-core`'s `ReviewOutcome` return
  type does not guarantee it reaches the DB: `run-executor.ts` destructures
  the outcome by name right before persistence, so a new field is silently
  dropped with no typecheck error (the destructuring just narrows, it
  doesn't require exhaustiveness). Grep the destructuring assignment before
  trusting a new outcome field is actually persisted:
  `server/src/modules/reviews/run-executor.ts:213`.

## Session Notes

## Open Questions
