---
name: run-plan
description: Implements an approved plan end to end. `/run-plan <plan-path> [mode:single|multi] [max-fix:N]` runs implementer, check-runner, then architecture-reviewer + plan-verifier in a fix loop (max 3 iterations) until clean. Spec and plan are written manually beforehand with spec-creator and implementation-planner; test-writer is not part of this flow. Manual invocation only; run it in a fresh chat.
disable-model-invocation: true
argument-hint: "<plan-path> [mode:single|multi] [max-fix:N]"
---

# /run-plan

You, the main session, orchestrate. Subagents cannot spawn subagents, so call
each agent yourself and never do its job inline. Agent rules:
`.claude/agents/README.md`.

Input: `$ARGUMENTS` = path to an approved `docs/plans/<feature>_en.md` with
sections 5, 7, 8 and 12. Missing or incomplete: say what, stop.

Optional arguments (any order, after the path):
- `mode:single` or `mode:multi` overrides the execution mode in plan section 12
  (default: the plan's mode). Note the override in the ledger.
- `max-fix:N` caps fix-loop iterations (default 3, integer 0-5; 0 = review
  once, no fixes). Unknown or invalid arguments: say so and stop.

Rules: pass paths and short summaries between agents, never pasted reports.
Do not commit, push or run `db:migrate`. Full test suites run **only** through
`check-runner`; tell implementer in its prompt: `typecheck` plus targeted tests
for files it touched, no package-wide suite.

## Steps

1. **Ledger.** Create `.claude/sdd-runs/<feature>.md` (gitignored): plan path,
   spec path (from the plan), iteration counter, findings table
   `id | source | severity | file:line | status | note`; status is
   `open | fixed | deferred | disputed`. Update after every step.
2. **Implement.** Invoke `implementer` with the plan path. Mode from `mode:` or,
   by default, plan section 12: multi-agent = one implementer per non-overlapping parallel lane
   in one message; single-agent = one pass.
3. **Checks.** Invoke `check-runner` for the touched packages. Failures go to
   `implementer` as a fix pass (counts as an iteration) before any review.
4. **Bundle.** `scripts/review-bundle.sh .claude/sdd-runs/<feature>-bundle.md`.
5. **Review (parallel, one message).** `architecture-reviewer` (changed-file
   list + bundle) and `plan-verifier` (plan path, bundle, check-runner report).
6. **Triage.** critical/major -> `open`; minor -> `deferred`; verifier
   FAIL/PARTIAL -> `open` (major). Stable id = rule id + file, or verifier id.

## Fix loop (max `max-fix` iterations, default 3)

While any `open` finding exists and iteration < `max-fix`:

1. iteration += 1. Invoke `implementer` with **only** the open findings (id,
   file:line, quoted evidence, rule, direction). It may mark one `disputed`
   with a one-line argument instead of changing code.
2. `check-runner`; failures go back to step 1.
3. New bundle with the diff since the previous bundle.
4. Narrow re-review in parallel: `architecture-reviewer` limited to the open
   rule ids plus files changed this iteration; `plan-verifier` in `narrow`
   mode with the open ids. Update the ledger.
5. Stop and ask the user if a finding id returns a second time or a critical
   one is `disputed`.

Exit: no `open` critical/major and verifier COMPLETE -> finish. Limit reached
with `open` items -> print the ledger summary and ask the user.

## Finish

Run `doc-writer` only if the plan asks for docs. Report: what was built,
iterations used, `deferred` minor findings, `disputed` items, anything NOT
VERIFIABLE, and that nothing is committed. Suggest `pr-self-review` next.
