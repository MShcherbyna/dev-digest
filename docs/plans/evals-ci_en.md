# Implementation Plan: Harness evals in GitHub Actions (`evals.yml`)

## 1. Goal & scope

**Goal.** Add `.github/workflows/evals.yml` that, on every same-repo pull request (and on manual
`workflow_dispatch`), detects which harness artifacts changed and runs only the matching evals in
`evals/` on OpenRouter:

- `changes` job: diff vs the base branch -> `evals/scripts/ci-detect.mjs` -> matrix outputs +
  a step summary with `SKIP <name> (no evals)` lines.
- `static` job (no model, blocking): `pnpm typecheck` + `pnpm eval:quality`.
- `skills` job (matrix, blocking): content tier, no proxy, `vitest run skills/<name>/`.
- `agents` job (matrix, blocking): LiteLLM proxy -> `vitest run agents/<name>/` -> teardown.
- `workflow` job (non-blocking, `continue-on-error`): proxy -> `pnpm eval:workflow`.

Plus the supporting edits to `evals/scripts/ci-detect.mjs` (extra workflow-tier triggers incl.
`AGENTS.md`, step summary, `EVAL_RUN_ALL`) and committing `evals/pnpm-workspace.yaml`.

**Non-goals.**
- Does not change any specification (`<pkg>/specs/**`) or requirement document.
- No change to the eval engine (`evals/src/**`), to any eval case, skill or agent.
- No change to other workflows, to `server/`, `client/`, `reviewer-core/`, `e2e/`, `mcp/`.
- No `push`-to-`main` trigger (user decision Q7).
- No skill-change trigger for the workflow tier (R7 rejected).
- No README rewrite (`evals/README.md` "Wiring it into GitHub Actions" stays as a generic
  example; a pointer can be a follow-up, see section 9).
- No UI.

## 2. Context read

Files read:
- `/Users/mtakumi/Projects/dev-digest/CLAUDE.md`
- `/Users/mtakumi/Projects/dev-digest/INSIGHTS.md` (root: the work touches `.github/` + `evals/`)
- `evals/README.md` (whole file; esp. "Runners: Claude Code vs OpenRouter", "Which cheap model —
  verified", "Wiring it into GitHub Actions (per-PR)", env var table)
- `evals/scripts/ci-detect.mjs`, `evals/scripts/litellm-proxy.sh`
- `evals/proxy/docker-compose.yml`, `evals/proxy/litellm.config.yaml`
- `evals/package.json`, `evals/pnpm-workspace.yaml` (untracked), head of `evals/pnpm-lock.yaml`,
  `evals/vitest.config.ts`, `evals/.gitignore`
- `evals/src/config.ts`, `evals/src/tasks.ts`, `evals/src/runtime/env.ts`,
  `evals/src/runtime/dispatch.ts`, `evals/src/runtime/run-openrouter.ts`
- `.github/workflows/client.yml`, `server-unit.yml`, `e2e-web.yml` (style reference)
- `.claude/settings.json` (project hooks loaded by `workflowTask`)
- `evals/workflow/review-workflow.cases.ts` (grep: which instruction files it asserts on)
- Proposal screenshot `.../images/2.png` (jobs 1-4 + model switch via env/inputs)

Existing evals at planning time: `evals/skills/dependency-checker/`,
`evals/agents/architecture-reviewer/`, `evals/agents/architecture-reviewer-lite/`,
`evals/workflow/review-workflow.eval.ts`.

`evals/` has no `AGENTS.md` or `INSIGHTS.md`; the root `INSIGHTS.md` applies. Relevant entries:

- `INSIGHTS.md` Codebase Patterns, 2026-09-24: "`CLAUDE.md` is a symlink to `AGENTS.md` in the
  root and in every package (client, server, reviewer-core, e2e), so editing either name edits the
  instructions loaded into every Claude session." -> git diffs show content edits under
  `AGENTS.md`, so the detector must key on `AGENTS.md` too.
- `INSIGHTS.md` Tool & Library Notes, 2026-09-18: "On this machine `pnpm` is not on `PATH` ...
  use `npx --yes pnpm@10 <cmd>` instead" -> local acceptance commands use `npx --yes pnpm@10`.
- `INSIGHTS.md` Tool & Library Notes, 2026-09-24: "`python3` here has no PyYAML ... Parse it with
  Ruby instead" -> YAML syntax fallback check uses Ruby.
- `INSIGHTS.md` Tool & Library Notes, 2026-10-11: zsh aborts on unquoted globs -> quote globs in
  acceptance commands.

README facts the plan relies on:
- Content tier under `EVAL_BACKEND=openrouter` is a direct OpenAI-compatible call, "DeepSeek and
  any non-Anthropic model work here natively, no proxy".
- Tool tiers need the LiteLLM proxy for non-Anthropic slugs; `google/gemini-2.5-flash` is the
  verified model that dispatches subagents; `deepseek/deepseek-chat` "does the work inline
  instead of dispatching".
- "Run tool-tier cases sequentially and/or with retries; keep concurrency low in CI."
- "Treat `activation` as indicative, not blocking when running on non-Anthropic models."
- "always set `EVAL_MODEL` together with `EVAL_BACKEND=openrouter`".

## 3. Affected modules

- repo root -> `.github/workflows/evals.yml` (**new**): the whole CI workflow.
- `evals` -> `scripts/ci-detect.mjs` (**modified**): more workflow-tier triggers, per-name SKIP
  log lines, `$GITHUB_STEP_SUMMARY` output, `EVAL_RUN_ALL` mode, header comment updated.
- `evals` -> `pnpm-workspace.yaml` (**existing untracked file, now committed as-is**; content
  unchanged: `allowBuilds: { esbuild: true }`).

Nothing else changes.

## 4. Contracts touched

- No Zod schemas, TS types, API or DB schema. No vendor copies involved.
- **CI contract of `ci-detect.mjs`** (its `$GITHUB_OUTPUT` keys) stays backward compatible:
  `skills` (JSON array), `agents` (JSON array), `run_workflow` (`true`/`false`),
  `skipped_skills`, `skipped_agents` (space-separated). New input env var: `EVAL_RUN_ALL`
  (`true` -> run everything that has evals). New optional side output: Markdown appended to
  `$GITHUB_STEP_SUMMARY` when that env var is set.
- **Repo configuration the workflow reads** (set by the user in GitHub settings, not in code):
  secret `OPENROUTER_API_KEY`; optional variables `EVAL_MODEL_SKILLS`, `EVAL_MODEL_TOOLS`,
  `EVAL_JUDGE_MODEL`.

## 5. Skills for implementer

- **security** -> steps 4-9 (`evals.yml`). Key rules for this task:
  - Secrets management: `OPENROUTER_API_KEY` only from `secrets.*`, only in the env of jobs that
    call the model (`skills`, `agents`, `workflow`), never in `changes`/`static`, never echoed.
  - Command injection: no `${{ ... }}` expression inside a `run:` script body; every context
    value (`github.base_ref`, default branch, `matrix.*`, inputs) is passed through `env:` and
    referenced as a quoted shell variable.

No other skill in the table applies (no server module, DB, client, Next.js or shared contract).

## 6. Architecture constraints

- Do-not-touch respected: no edits to `*/vendor/shared/**`, `client/src/vendor/ui/**`,
  `server/src/db/migrations/**`, any `pnpm-lock.yaml` (the evals lockfile is read only, via
  `--frozen-lockfile`).
- `evals/src/**`, the eval cases and `.claude/**` are not edited.
- Workflow style matches existing workflows: header comment block explaining the jobs,
  top-level `permissions: contents: read`, `concurrency` with `cancel-in-progress: true`,
  `actions/checkout@v4`, `pnpm/action-setup@v4` with `version: 10`, `actions/setup-node@v4`
  with `node-version: 22`, `cache: pnpm`, `cache-dependency-path: evals/pnpm-lock.yaml`,
  `defaults.run.working-directory: evals` in jobs that run pnpm.
- `ci-detect.mjs` stays dependency-free (Node built-ins only) so the `changes` job needs no
  `pnpm install`.
- Commit messages are prefixed with the branch name (e.g. `L06-lab: ...`).

## 7. Steps

Single-agent mode: the `implementer` owns every step; steps run in order.

### Step 1 - extend workflow-tier triggers in `ci-detect.mjs`
File: `evals/scripts/ci-detect.mjs`. Skill: security (no new I/O; pure string checks).
- Extend the `runWorkflow` predicate so it is also true when a changed path is:
  - `AGENTS.md` (root; the real file behind the `CLAUDE.md` symlink),
  - `server/AGENTS.md`, `client/AGENTS.md`, `reviewer-core/AGENTS.md`, `e2e/AGENTS.md`,
    `mcp/AGENTS.md` (one anchored regex over those five package names),
  - `evals/package.json`, `evals/pnpm-lock.yaml`, `evals/pnpm-workspace.yaml`,
    `evals/vitest.config.ts`, `evals/tsconfig.json`, `evals/scripts/litellm-proxy.sh`,
  - anything under `evals/proxy/`.
- Keep every existing condition (`CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/agents/*.md`,
  `evals/workflow/`, `evals/src/`).
- Do not add `.claude/skills/**` (R7 rejected).
- Update the header comment's trigger list to match.

### Step 2 - add `EVAL_RUN_ALL` mode to `ci-detect.mjs` (R5)
File: `evals/scripts/ci-detect.mjs`.
- When `process.env.EVAL_RUN_ALL === "true"`: `skills` = every directory under `evals/skills/`
  for which the existing `hasEvals("skills", name)` is true; `agents` = same for
  `evals/agents/`; `run_workflow` = `true`; `skipped_skills`/`skipped_agents` empty.
  Results sorted, like the existing ones. Ignore `CHANGED_FILES` in this mode.
- Otherwise behaviour is unchanged (apart from step 1).
- Use `readdirSync(..., { withFileTypes: true })` filtered to directories; a missing
  `evals/skills` or `evals/agents` directory yields `[]`, not a crash.

### Step 3 - SKIP log lines + step summary in `ci-detect.mjs` (R1)
File: `evals/scripts/ci-detect.mjs`.
- Replace the two aggregate SKIP stderr lines with one stderr line per skipped artifact, exact
  text `SKIP <name> (no evals)` (for skills and agents alike). Keep the other stderr summary
  lines.
- When `process.env.GITHUB_STEP_SUMMARY` is set, `appendFileSync` a Markdown block:
  heading `### Harness evals - change detection`; mode line (`changed files: N` or
  `run_all`); a small table with rows `skills`, `agents`, `workflow tier` and the value to run
  (`(none)` when empty, `run`/`skip` for workflow); then one line per skipped artifact,
  `SKIP <name> (no evals)`.
- Step outputs to `$GITHUB_OUTPUT` keep their names and formats (section 4). When
  `GITHUB_OUTPUT` is unset, keep the existing `console.log` fallback so the script stays
  runnable locally.

### Step 4 - workflow skeleton
File: `.github/workflows/evals.yml` (**new**). Skill: security.
- Header comment: what each job does, why skills run without a proxy, why agents/workflow need
  it, why `workflow` is non-blocking (README: activation is indicative on non-Anthropic models),
  where to set the secret/variables.
- `name: evals`.
- `on.pull_request.paths`: `evals/**`, `.claude/skills/**`, `.claude/agents/**`,
  `.claude/CLAUDE.md`, `CLAUDE.md`, `AGENTS.md`, `server/AGENTS.md`, `client/AGENTS.md`,
  `reviewer-core/AGENTS.md`, `e2e/AGENTS.md`, `mcp/AGENTS.md`, `.github/workflows/evals.yml`.
  No `push` trigger.
- `on.workflow_dispatch.inputs`: `model_skills` (string, default `''`), `model_tools` (string,
  default `''`), `judge_model` (string, default `''`), `run_all` (boolean, default `false`);
  each with a description naming its fallback.
- `permissions: contents: read`.
- `concurrency: group: evals-${{ github.ref }}`, `cancel-in-progress: true`.
- Top-level `env`:
  - `EVAL_BACKEND: openrouter`
  - `MODEL_SKILLS: ${{ inputs.model_skills || vars.EVAL_MODEL_SKILLS || 'deepseek/deepseek-chat' }}`
  - `MODEL_TOOLS: ${{ inputs.model_tools || vars.EVAL_MODEL_TOOLS || 'google/gemini-2.5-flash' }}`
  - `EVAL_JUDGE_MODEL: ${{ inputs.judge_model || vars.EVAL_JUDGE_MODEL || 'deepseek/deepseek-chat' }}`

  (`inputs` is empty on `pull_request`, so the expression falls through to the repo variable,
  then to the default.) Do not put `OPENROUTER_API_KEY` at the top level.

### Step 5 - job `changes` (detector)
File: `.github/workflows/evals.yml`.
- `runs-on: ubuntu-latest`, `timeout-minutes: 5`, no `working-directory` default.
- `outputs`: `skills`, `agents`, `run_workflow`, `skipped_skills`, `skipped_agents` from the
  detect step, plus `trusted` (see below).
- Steps:
  1. `actions/checkout@v4` with `fetch-depth: 0` (needed for the three-dot diff, G3).
  2. `actions/setup-node@v4`, `node-version: 22` (no pnpm, no install: the script has no deps).
  3. Step `detect` (id `detect`): env `BASE_BRANCH: ${{ github.base_ref || github.event.repository.default_branch }}`
     and `EVAL_RUN_ALL: ${{ inputs.run_all || 'false' }}`. The script part
     computes `git diff --name-only "origin/${BASE_BRANCH}...HEAD"` into `CHANGED_FILES`
     (exported for the node call) and runs `node evals/scripts/ci-detect.mjs`. No `${{ }}`
     inside `run:`.
  4. Step `trust` (id `trust`): env `IS_FORK: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name != github.repository }}`.
     Writes `trusted=true|false` to `$GITHUB_OUTPUT`; when it is a fork, append
     `Model jobs skipped: fork PR (no secrets).` to `$GITHUB_STEP_SUMMARY`.

### Step 6 - job `static` (R2, no model, blocking)
File: `.github/workflows/evals.yml`.
- `needs: changes`; `if: needs.changes.outputs.skills != '[]' || needs.changes.outputs.agents != '[]' || needs.changes.outputs.run_workflow == 'true'`
  (runs for forks too: no secrets used). `timeout-minutes: 10`,
  `defaults.run.working-directory: evals`.
- Steps: checkout; `pnpm/action-setup@v4` (`version: 10`); `actions/setup-node@v4` (22, pnpm
  cache, `cache-dependency-path: evals/pnpm-lock.yaml`); `pnpm install --frozen-lockfile`;
  `pnpm typecheck`; `pnpm eval:quality`.

### Step 7 - job `skills` (matrix, blocking, content tier, no proxy)
File: `.github/workflows/evals.yml`.
- `needs: [changes, static]`.
- Job-level `if: needs.changes.outputs.trusted == 'true' && needs.changes.outputs.skills != '[]'` (G5 + G7).
- `strategy: fail-fast: false, max-parallel: 2, matrix: skill: ${{ fromJSON(needs.changes.outputs.skills) }}`.
- `name: skill ${{ matrix.skill }}`, `timeout-minutes: 20`, working dir `evals`.
- Job `env`: `OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}`,
  `EVAL_MODEL: ${{ env.MODEL_SKILLS }}` (or repeat the same expression as step 4 if `env`
  context is not allowed at job-level `env`; see section 10), `SKILL: ${{ matrix.skill }}`.
  No `OPENROUTER_BASE_URL` (direct OpenRouter).
- Steps: checkout; pnpm setup; node setup (as step 6); `pnpm install --frozen-lockfile`;
  preflight (R4): if `OPENROUTER_API_KEY` is empty, print
  `::error::OPENROUTER_API_KEY secret is not configured` and exit 1; run
  `pnpm exec vitest run "skills/${SKILL}/"` (**trailing slash required**, G2); upload
  `actions/upload-artifact@v4` with `if: always()`, `name: evals-results-skill-${{ matrix.skill }}`,
  `path: evals/results/`, `if-no-files-found: ignore` (G6).

### Step 8 - job `agents` (matrix, blocking, tool tier, proxy)
File: `.github/workflows/evals.yml`.
- `needs: [changes, static]`.
- Job-level `if: needs.changes.outputs.trusted == 'true' && needs.changes.outputs.agents != '[]'`.
- `strategy: fail-fast: false, max-parallel: 2, matrix: agent: ${{ fromJSON(needs.changes.outputs.agents) }}`.
- `name: agent ${{ matrix.agent }}`, `timeout-minutes: 30`, working dir `evals`.
- Job `env`: `OPENROUTER_API_KEY` (secret), `OPENROUTER_BASE_URL: http://localhost:4000`,
  `EVAL_MODEL` = tools model (`MODEL_TOOLS`), `AGENT: ${{ matrix.agent }}`. `EVAL_JUDGE_MODEL`
  inherited from top-level env (the judge goes through the proxy, which forwards any slug).
- Steps: checkout; pnpm + node setup; install frozen; preflight (as step 7);
  proxy up (R6): `docker compose -f proxy/docker-compose.yml up -d`; `pnpm proxy:wait`;
  `pnpm exec vitest run "agents/${AGENT}/"` (**trailing slash required**: without it
  `architecture-reviewer` also runs `architecture-reviewer-lite`);
  on `if: failure()`: `docker compose -f proxy/docker-compose.yml logs --tail 100 || true`;
  on `if: always()`: `pnpm proxy:down` (the wrapper supplies a placeholder key for compose
  interpolation); upload artifact `evals-results-agent-${{ matrix.agent }}` as in step 7.

### Step 9 - job `workflow` (non-blocking)
File: `.github/workflows/evals.yml`.
- `needs: [changes, static]`.
- Job-level `if: needs.changes.outputs.trusted == 'true' && needs.changes.outputs.run_workflow == 'true'`.
- `continue-on-error: true`, `timeout-minutes: 45`, working dir `evals`.
- Job `env`: same as step 8 minus `AGENT`.
- Steps: as step 8, but the test command is `pnpm eval:workflow`, and the artifact name is
  `evals-results-workflow`.

### Step 10 - commit `evals/pnpm-workspace.yaml`
File: `evals/pnpm-workspace.yaml` (content unchanged).
- Stage and commit it together with the workflow (Q1 answer). Do **not** touch
  `reviewer-core/pnpm-workspace.yaml` (out of scope; reviewer-core uses npm).
- Commits: separate `git add` / `git commit` calls, message prefix `L06-lab: ` (or the current
  branch name).

### Step 11 - run acceptance checks (section 8) and record insights
- Run every check in section 8 that can run locally.
- If something non-obvious came up (e.g. vitest filter substring matching, the `AGENTS.md`
  symlink effect on path-based CI detection), record it in the root `INSIGHTS.md` per the
  `engineering-insights` skill (targeted edit, max 3 entries, dedupe first).

## 8. Acceptance checks

All from `/Users/mtakumi/Projects/dev-digest`. Use `npx --yes pnpm@10` wherever `pnpm` is not on
PATH. Use a scratch file for outputs, e.g. `OUT=$(mktemp)`; `SUM=$(mktemp)`.

**A. Detector, local (`node evals/scripts/ci-detect.mjs`).** Run each case with
`CHANGED_FILES=$'<lines>' GITHUB_OUTPUT="$OUT" GITHUB_STEP_SUMMARY="$SUM"`, then inspect both
files (truncate between cases):

| # | CHANGED_FILES | Expected |
|---|---|---|
| A1 | `.claude/agents/architecture-reviewer.md` | `agents=["architecture-reviewer"]`, `run_workflow=true`, `skills=[]` |
| A2 | `evals/agents/architecture-reviewer-lite/architecture-reviewer-lite.cases.ts` | `agents=["architecture-reviewer-lite"]` only, `run_workflow=false` |
| A3 | `.claude/skills/dependency-checker/SKILL.md` + `.claude/skills/security/SKILL.md` | `skills=["dependency-checker"]`, `skipped_skills=security`, `run_workflow=false`; stderr and summary contain `SKIP security (no evals)` |
| A4 | `AGENTS.md` | `run_workflow=true`, `skills=[]`, `agents=[]` |
| A5 | `server/AGENTS.md` (repeat for `client`, `mcp`) | `run_workflow=true` |
| A6 | `evals/pnpm-lock.yaml` (repeat for `evals/package.json`, `evals/proxy/docker-compose.yml`, `evals/vitest.config.ts`) | `run_workflow=true` |
| A7 | `README.md` | all empty, `run_workflow=false` |
| A8 | empty string | `skills=[]`, `agents=[]`, `run_workflow=false`, no crash |
| A9 | `EVAL_RUN_ALL=true`, any CHANGED_FILES | `skills=["dependency-checker"]`, `agents=["architecture-reviewer","architecture-reviewer-lite"]`, `run_workflow=true` |
| A10 | A3 with `GITHUB_OUTPUT`/`GITHUB_STEP_SUMMARY` unset | outputs printed to stdout via the fallback, no summary write, exit 0 |

**B. Vitest filter (G2).** In `evals/`: `npx --yes pnpm@10 exec vitest list "agents/architecture-reviewer/"`
must list only files under `agents/architecture-reviewer/`, not `-lite`. Collection only, no model
calls. If `vitest list` is unavailable in vitest 2.1, record that in the report and rely on the
trailing-slash rule.

**C. Install parity (Q1).** Copy `evals/package.json`, `evals/pnpm-lock.yaml`,
`evals/pnpm-workspace.yaml` into a fresh scratch directory and run
`npx --yes pnpm@10 install --frozen-lockfile` there; it must succeed without lockfile changes.

**D. Package checks.** In `evals/`: `npx --yes pnpm@10 typecheck` and
`npx --yes pnpm@10 eval:quality` pass (same commands the `static` job runs). No model-backed eval
needs to run locally.

**E. Workflow lint.**
- `actionlint .github/workflows/evals.yml` if actionlint is installed (it also runs shellcheck on
  `run:` blocks when shellcheck is present). Otherwise a YAML parse:
  `ruby -ryaml -e 'YAML.load_file(".github/workflows/evals.yml"); puts "ok"'`, and say in the
  report that actionlint was not available.
- Review by hand: no `${{` inside any `run:` body (`grep -n '\${{' .github/workflows/evals.yml`
  and confirm every hit is in `if:`, `env:`, `with:`, `name:`, `matrix`, `outputs` or
  `concurrency`); `OPENROUTER_API_KEY` appears only in `skills`/`agents`/`workflow` job env.

**F. On GitHub (manual, by the user after push; not a local blocker).**
- Set the secret `OPENROUTER_API_KEY` (Settings -> Secrets and variables -> Actions).
- Open the PR: the `changes` summary shows the detection table. `evals/pnpm-workspace.yaml` is new
  in this PR, so `run_workflow=true`: `static` passes and `workflow` runs (non-blocking).
  `skills`/`agents` show as skipped (empty matrix) and the run is not red because of that.
- Optionally run `workflow_dispatch` with `run_all=true` once: one `skills` leg
  (`dependency-checker`), two `agents` legs, one `workflow` job; artifacts
  `evals-results-*` are uploaded.

No browser check: there is no UI change.

## 9. Risks & open questions

Open questions: none (all answered, see section 11).

Risks / for the architecture and security reviewers:
- **Secret scope.** Confirm `OPENROUTER_API_KEY` is set only at job level in the three model
  jobs and that the fork guard (`trusted`) gates all three. The LiteLLM proxy runs in no-auth mode
  on the runner's localhost only; failure-time `docker compose logs` could print request details.
  The README says the key is not sent by the SDK through the proxy, but this is not verified.
- **Script injection.** Check that `github.base_ref`, the default branch, `matrix.*` and the
  dispatch inputs reach shell only via `env:`. Dispatch inputs are model slugs that go into
  `env` only.
- **Cost and flakiness.** OpenRouter rate limits can make tool-tier legs flaky (README).
  `max-parallel: 2` + `fail-fast: false` reduce this; vitest `fileParallelism: true` still runs
  files in one leg concurrently (one agent dir usually has one eval file).
- **Engine changes run only the workflow tier.** A change to `evals/src/**` does not re-run the
  skills/agents evals (approved design). Use `run_all` dispatch for that.
- **Required checks.** Skipped jobs count as success. If `skills`/`agents` are made required
  status checks, an artifact without evals passes silently (by design: SKIP, not fail).
- **`workflowTask` loads `.claude/settings.json`**: its `PreToolUse` hook only matches `Bash`,
  which is not in `WORKFLOW_ALLOWED_TOOLS`, so it should not fire in CI.
- **Follow-up (not in scope):** a one-line pointer from `evals/README.md` "Wiring it into GitHub
  Actions" to the real `.github/workflows/evals.yml`.

## 10. Could not determine

- Whether `pnpm eval:quality` exits non-zero on a failing check (I did not read
  `evals/src/skill-quality.ts`). If it always exits 0, the `static` job only catches type
  errors. The implementer should check and say so in the report; do not change the engine.
- Whether the job-level `env:` block can reference the top-level `env` context
  (`${{ env.MODEL_SKILLS }}`). If actionlint rejects it, repeat the full
  `inputs.* || vars.* || 'default'` expression in each job's `env` instead.
- Which pnpm version generated `evals/pnpm-workspace.yaml` (`allowBuilds`), and whether pnpm 10
  in CI reads that key. `package.json`'s `pnpm.onlyBuiltDependencies: ["esbuild"]` covers esbuild
  either way; check C confirms the install.
- Whether `vitest list` with a path filter works in vitest 2.1.9 (check B has a fallback).
- Real end-to-end behaviour on GitHub (secret present, proxy pull time, OpenRouter limits) can
  only be checked after push (check F).

## 11. Requirements review

**Questions and answers** (answers relayed by the coordinator: "User approved all your defaults
and recommendations"):

1. Commit `evals/pnpm-workspace.yaml`? -> "commit evals/pnpm-workspace.yaml".
2. pnpm / Node versions? -> "pnpm 10 / Node 22".
3. `AGENTS.md` symlink -> "AGENTS.md + <pkg>/AGENTS.md also trigger workflow tier, keep CLAUDE.md".
4. Extra engine files for `run_workflow`? -> "extra engine files trigger workflow tier".
5. `workflow_dispatch` behaviour? -> "dispatch diffs vs default branch".
6. Judge model? -> "single EVAL_JUDGE_MODEL default deepseek/deepseek-chat".
7. Triggers? -> "triggers = pull_request + workflow_dispatch only".

Models (user-approved): "skills job = deepseek/deepseek-chat; agents + workflow jobs =
google/gemini-2.5-flash. Overridable via repo vars (EVAL_MODEL_SKILLS, EVAL_MODEL_TOOLS,
EVAL_JUDGE_MODEL) and workflow_dispatch inputs. Workflow job non-blocking; skills/agents blocking."

**Gaps and conflicts found** (all addressed in the steps):
- G1 `CLAUDE.md` is a symlink, so edits show as `AGENTS.md` -> step 1.
- G2 vitest substring filter (`architecture-reviewer` also matches `-lite`) -> trailing slash in
  steps 7-8, check B.
- G3 three-dot diff needs full history -> `fetch-depth: 0`, step 5.
- G4 no step summary in `ci-detect.mjs` -> step 3.
- G5 empty matrix errors -> job-level `if`, steps 7-8.
- G6 duplicate artifact names rejected by upload-artifact v4 -> per-leg names, steps 7-9.
- G7 fork PRs have no secrets -> `trusted` output + job `if`, steps 5, 7-9.
- G8 shell injection -> context via `env:` only, steps 5-9.
- G9 missing key gives noisy errors -> preflight step (R4), steps 7-9.
- G10 skipped required checks count as success -> section 9.
- G11 `ci-detect.mjs` has no unit tests -> acceptance check A.

**Recommendations and decisions:**
- R1 SKIP lines + summary in `ci-detect.mjs` -> **accepted** (step 3).
- R2 no-model gate (`typecheck` + `eval:quality`) -> **accepted** (step 6).
- R3 `timeout-minutes` + `max-parallel: 2` -> **accepted** (steps 5-9).
- R4 secret preflight with a clear error -> **accepted** (steps 7-9).
- R5 `run_all` dispatch input -> **accepted** (steps 2, 4, 5).
- R6 README-style proxy lifecycle (compose up -d, `proxy:wait`, logs on failure, down always) ->
  **accepted** (steps 8-9).
- R7 skill changes trigger the workflow tier -> **rejected**.

## 12. Execution mode

**single-agent** (user's choice: "Execution mode: single-agent").

One `implementer` pass does steps 1-11 in order, with no hand-offs. The implementer runs the
checks in section 8 itself (A-E). Check F needs the user (secret configuration and a real PR run)
and goes in the final report as pending.
