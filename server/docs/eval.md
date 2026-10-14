# Eval pipeline (part 1)

Turns accepted/dismissed findings into regression cases for review agents,
runs an agent over all its cases with fixed inputs, and scores the result
deterministically. Module: `src/modules/eval/`.

## Layout

| File | Role |
|---|---|
| `routes.ts` | Zod params/body/querystring/response, rate limits, status codes. One service call per route. |
| `service.ts` | Use cases (`EvalService`): create from finding, case CRUD, start runs, read runs, `reapStale`. |
| `executor.ts` | Runs cases through the review engine: `runSingle`, `runAgentRun`. Sequential, fire-and-forget. |
| `ports.ts` | Application-layer ports (`EvalCaseStore`, `EvalRunStore`, `FindingSource`, `AgentSource`, engine, diff helpers). |
| `repository.ts` | Drizzle implementation of the stores, `FindingSource` and the reviews `EvalCaseLinks` port. |
| `schemas.ts` | Zod contracts (module-local). |
| `domain/` | Pure: `scoring.ts`, `case-diff.ts`, `slug.ts`. |

Composition is in `platform/container.ts` (`container.eval`, `container.evalCaseLinks`).
The engine adapter wraps `reviewPullRequest` from `reviewer-core` and passes
only: system prompt, model, strategy, the case diff, the task line
(`buildTaskLine({ title })`) and the PR body. No skills, memory, specs, callers,
repo map or intent.

Cross-module access: reviews reads `eval_case_id` through `reviews/ports.ts`
`EvalCaseLinks` (one batched lookup per `GET /pulls/:id/reviews`); eval reaches
agents only through `AgentSource`.

## Scoring (spec 4.3)

- Match: same `file` and inclusive line overlap (`f.start <= i.end && i.start <= f.end`);
  missing `end_line` = `start_line`. Only grounded findings count.
- Per case: `must_find_total`, `must_find_matched`, `positive_findings` (matches
  a `must_find` item), `negative_findings` (not positive and matches a
  `must_not_flag` item, plus every grounded finding of an empty-array case).
  Unlabelled findings are in neither bucket. A finding matching both kinds is
  positive (must_find precedence) but the case still fails.
- Pass: all `must_find` matched, no finding matches a `must_not_flag` item, and
  an empty-array case needs zero findings.
- Run aggregate over executed (non-error) cases: recall = sum(matched)/sum(total);
  precision = sum(positive)/(sum(positive)+sum(negative)); citation accuracy =
  sum(kept)/(sum(kept)+sum(dropped)); denominator 0 gives `null`. Cost is the sum
  of executed case costs, `null` if any is `null`.
- Run status: no errors `done`; some errored `partial`; all errored `failed`
  (metrics `null`). A crash mid-run also ends `failed`.

## Status codes

Business-rule errors are **422** here (the spec asks for it), unlike
`project-context` which uses 400 for path rules: `undecided`, `diff_unavailable`,
`range_outside_diff`, `agent_missing`, `diff_unparsable`, `diff_too_large`,
`expectation_outside_diff {index}`, `no_cases`, and malformed bodies
(`validation_error`). Conflicts are **409** with ids in `details`:
`eval_case_exists {case_id}`, `eval_case_running {result_id}`,
`eval_run_active {eval_run_id}`. Foreign/unknown ids are 404 (workspace-scoped).
Create/update bodies get a 4 MB `bodyLimit` so a 1,000,000-char diff reaches the
`diff_too_large` check instead of a 413.

## Contracts: module-local nullable metrics

The vendored `EvalRun` / `EvalCase` contracts have no nullable metrics, so the
eval shapes live in `schemas.ts` and are mirrored by hand in
`client/src/lib/hooks/eval.ts`. **Flag:** re-vendor `EvalRun` / `EvalDashboard`
with nullable metrics at the sync source, then drop the local copies.

## Execution and the boot reaper

Runs are fire-and-forget (`void ...catch(log)`), not `JobRunner` (its timeout and
retries do not fit long runs). One active run per agent is enforced twice: a
service pre-check and a partial unique index on `eval_agent_runs(agent_id)
WHERE status = 'running'`; likewise one running single-case result per case.
Cases run one at a time; each finished case is inserted with the run counters
bumped in one transaction. Before each case the executor checks the run still
exists (agent deleted: stop, `reason=agent_deleted` in the log). A case deleted
mid-run counts as an error (`case_deleted`) with no result row (FK).
A missing API key marks every case `error` and the run `failed`
(`missing_api_key`) without any LLM call.

On boot `app.ts` calls `container.eval.reapStale()`: `running` agent runs become
`failed` (`interrupted`), `running` case results become `error` (`interrupted`).
Logs contain ids, counts, status, duration and cost only, never diff, PR body,
prompt or finding text.

## Agents -> eval_cases delete reach

`eval_cases.owner_id` is polymorphic (skill | agent) and has no FK, so
`AgentsRepository.deleteById` deletes the agent's cases in the same transaction
(table-level cascade emulation, the one accepted reach into eval tables).
Agent-level runs cascade by FK; per-case results cascade via the case.
