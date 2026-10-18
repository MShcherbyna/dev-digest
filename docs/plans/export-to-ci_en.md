# Implementation Plan: Export to CI

Spec: `specs/2026-10-16-export-to-ci.md` (SPEC-2026-10-16-export-to-ci, 36 ACs).
Branch: `emdash/export-to-ci-st5vt`. Mode: multi-agent.

The work runs in this order:
1. **Step 0, done by the main session.** It applies the user-sanctioned
   edits to the vendored files.
2. **Three sequential implementer slices:** S1 (agent-runner), S2 (server),
   S3 (client).
3. **Review:** check-runner, then architecture-reviewer, then plan-verifier.

## 1. Goal & scope

**Goal.** Ship Export to CI end to end, as the spec defines it:
- a four-step wizard (Target, Preview, Configure, Install). It generates
  `.devdigest/**` plus `.github/workflows/devdigest-review.yml`, and installs
  them through a `devdigest/ci` PR or a zip.
- removal through a PR.
- pull-only ingest of CI result artifacts into `agent_runs`
  (`source='ci'`), run traces and `ci_runs`.
- the agent CI tab and the CI Runs page.
- the runner side of the contract: `memory.jsonl` and the extended,
  slug-named result file.

All 36 ACs and NFR-1..9 are in scope, with no MVP cuts (user decision).
AC-31 is built as the temporary gate.

**Non-goals.**
- Does not change any specification (`specs/**` is read-only input).
- No multi-manifest runner work (D-MA-1 selection logic). The user builds
  it in a separate worktree, so the AC-18 case "two manifests present, the
  selected one is used" is not implemented here. This plan does two things
  toward it:
  - S1 names the result file by slug (AC-20).
  - The generated workflow already sets `DEVDIGEST_AGENT` and uploads the
    slug-named artifact.
- None of these:
  - CircleCI, Jenkins or CLI generators;
  - a published Action;
  - a push ingest endpoint;
  - a GitHub App;
  - reading or writing secret values.
- No change to the multi-agent run service or the PR feed/timeline code.
- No change to `reviewer-core`. The runner reuses its exported
  `wrapUntrusted`.
- No change to `.claude/hooks/**` (user decision).

## 2. Context read

**Files read.**
- Instructions and insights: `CLAUDE.md`, root `INSIGHTS.md`,
  `server/AGENTS.md`, `server/INSIGHTS.md`, `client/AGENTS.md`,
  `client/INSIGHTS.md`, `agent-runner/CLAUDE.md`,
  `agent-runner/insights/INSIGHTS.md`, `reviewer-core/CLAUDE.md`.
- Spec and design: the spec, and the 5 screenshots.
- Shared contracts, both copies:
  - `{server,client}/src/vendor/shared/contracts/eval-ci.ts`
  - `{server,client}/src/vendor/shared/contracts/trace.ts`
  - client `knowledge.ts` / `findings.ts` (they export `Provider`,
    `CiFailOn` and `Verdict`)
  - server `adapters.ts` (GitHubClient)
  - server `vendor/shared/index.ts` (barrel with `export *`, so it needs no
    change)
- Server:
  - `server/src/db/schema/{ci,runs,agents,repos,knowledge}.ts`
  - `server/src/adapters/github/{octokit,pr-history}.ts`
  - `server/src/platform/{container,errors}.ts`, `server/src/app.ts`
  - `server/src/modules/index.ts`, `server/src/modules/brief/routes.ts`,
    `server/src/modules/agents/service.ts`
  - `server/package.json`
- agent-runner: `agent-runner/src/{index,run,manifest,artifact,context}.ts`,
  `agent-runner/package.json`.
- reviewer-core: `reviewer-core/src/prompt.ts` (the memory slot and
  `wrapUntrusted`), and `reviewer-core/src/index.ts`, which exports
  `wrapUntrusted`.
- Client:
  - `client/package.json`
  - `client/src/lib/api.ts` (`ApiError` exposes `status`, `code` and
    `details`)
  - `client/src/vendor/ui/{ExportWizardSteps.tsx,nav.ts,icons.tsx}`
    (`Icon.Workflow` exists)
  - `client/src/components/app-shell/{helpers.ts,AppShell.tsx}`
  - `client/src/app/agents/[id]/_components/AgentEditor/{AgentEditor.tsx,constants.ts}`
  - `.../ConfigTab/ConfigTab.tsx`
  - `client/src/lib/hooks/agents.ts`
  - `client/messages/en/ci.json`
- Harness: `.claude/skills/design/SKILL.md` and
  `.claude/hooks/implementer-guard.sh`.
- Root `.gitignore`. It contains `dist/`, so `agent-runner/dist` is not
  committed.

**Relevant insight entries (quoted).**
- Root `INSIGHTS.md`, on the two vendored contract copies:
  "`server/src/vendor/shared` and `client/src/vendor/shared` ... there is no
  sync script between them ... Don't overwrite one copy with the other;
  splice only the block you own into both (`diff -rq
  server/src/vendor/shared client/src/vendor/shared`)."
- Root `INSIGHTS.md`, on the guard hook: "`implementer-guard.sh`'s
  Edit/Write block on `*/vendor/shared/**` has no exception for a plan that
  explicitly sanctions one specific line ... the hook still exits 2". This
  is why Step 0 is done by the main session.
- Root `INSIGHTS.md`, on tooling: "On this machine `pnpm` is not on `PATH`
  ... use `npx --yes pnpm@10 <cmd>`."
- `server/INSIGHTS.md`, on body limits: "Eval case routes set a per-route
  `bodyLimit` (4 MiB) on purpose: Fastify's default 1 MiB limit would
  reject ... with a bare 413 before the service runs". This applies to the
  export body, which can carry a workflow of up to 5 MB.
- `server/INSIGHTS.md`, on rate limits in tests: "`app.ts` registers
  `@fastify/rate-limit` only when `config.nodeEnv !== 'test'` ... to assert
  a 429 build a dedicated app with `{ ...loadConfig(...), nodeEnv:
  'production', logLevel: 'silent' }`".
- `server/INSIGHTS.md`, on the precedent for a feature-local GitHub port:
  "`GitHubClient` (vendored) has no history/associated-PR call, so Prior PRs
  uses a blast-local port `PriorPrSource` with an Octokit ... adapter ...
  Tests inject `ContainerOverrides.priorPrs` — without it an `.it` test
  would use the developer's real `GITHUB_TOKEN`."
- `server/INSIGHTS.md`, on trace storage: "project-context trace field is
  module-local ... safe because the trace is stored as raw jsonb".
- `server/INSIGHTS.md`, on empty request bodies: "A Fastify zod `body`
  schema that must tolerate 'no body sent' needs `.nullish()`".
- `server/INSIGHTS.md`, on test typechecking: "`server/tsconfig.json` has
  `include: ["src/**/*.ts"]`, so `pnpm typecheck` never type-checks
  `server/test/**`".
- `server/INSIGHTS.md`, on real secrets in tests: "`*.it.test.ts` suites
  build `loadConfig(process.env)`, so `LocalSecretsProvider` reads the
  developer's REAL `~/.devdigest/secrets.json`". Every CI `.it` test must
  inject the CI GitHub mock.
- `client/INSIGHTS.md`, on the nav: "`client/src/vendor/ui/nav.ts` was
  edited locally (not at the sync source) ... Port all three edits to the
  sync source." Step 0 adds a fourth edit.
- `client/INSIGHTS.md`, on Retry labels: "`@devdigest/ui` `ErrorState`
  hard-codes the English 'Retry' label ... cannot satisfy a 'every label
  from `messages/`' rule".
- `client/INSIGHTS.md`, on test queries: "the vendored `@devdigest/ui`
  `Tabs` renders plain `<button>`s (no `role="tab"`) ... `ToastProvider`
  always mounts a `role="status"` live region".
- `client/INSIGHTS.md`, on focus return: "A modal that mounts after an
  async step ... restores focus to `<body>` on close ... Capture the
  trigger on click into a ref and pass `returnFocusTo` to
  `AccessibleModal`."
- `client/INSIGHTS.md`, on user events: "`@testing-library/user-event` is
  NOT a client dependency ... component tests use the `fireEvent`-based
  shim `src/test/user.ts`".
- `client/INSIGHTS.md`, on vitest filters: "`vitest run <path>` treats its
  argument as a regex filter, so a path with the Next dynamic-route
  brackets ... silently matches nothing".
- `agent-runner/insights/INSIGHTS.md`, on the bundle: "`ncc build` ...
  fully inlines ... verified with `grep -c "^import\|require("
  dist/index.js` returning 0".
- `agent-runner/insights/INSIGHTS.md`, on typecheck: "`pnpm typecheck` in
  `agent-runner` fails with `Cannot find module 'zod'` ... if
  `reviewer-core/node_modules` was never installed".
- `agent-runner/insights/INSIGHTS.md`, Open Question: "`AgentManifest` has
  no `post_as` field ... threaded through the workflow as an explicit env
  var?" AC-8 and AC-12 close it: `DEVDIGEST_POST_AS` is set in the
  workflow.

**Design sources.**
- The 5 screenshots map to the spec's screenshots 1 (Target), 2 (CI tab),
  3 (Preview), 5 (Configure) and 6 (Install). The spec has no screenshot 4.
- This worktree has no `design/` folder. The fallback HTML is in the main
  checkout:
  `/Users/mtakumi/Projects/dev-digest/design/DevDigest Design (standalone) (3).html`.
  S3 inspects it there with grep or a browser, never `Read` on the whole
  file. It is the reference for:
  - the CI Runs page;
  - the CI tab empty state;
  - the filters;
  - the "Fail CI on" and "Recent CI runs" blocks.

## 3. Affected modules

**Vendored files (Step 0, main session only; no implementer touches
them).**
- `server/src/vendor/shared/contracts/eval-ci.ts`: the CI block is
  replaced. This copy is the master.
- `client/src/vendor/shared/contracts/eval-ci.ts`: the identical CI block,
  plus an import line.
- `server/src/vendor/shared/contracts/trace.ts` and
  `client/src/vendor/shared/contracts/trace.ts`: four lines are added to
  `RunTrace.config`.
- `client/src/vendor/ui/nav.ts`: a GLOBAL group with "CI Runs".

**agent-runner (S1).**
- New:
  - `agent-runner/src/memory.ts` loads and validates
    `.devdigest/memory.jsonl`.
  - `agent-runner/src/memory.test.ts`.
- Modified:
  - `agent-runner/src/run.ts`: loads memory, passes it wrapped, extends
    the artifact input, and writes the slug-named result.
  - `agent-runner/src/artifact.ts`: new fields, `RUNNER_VERSION`, and the
    dependency versions.
  - `agent-runner/src/context.ts`: the PR head SHA.
  - `agent-runner/src/manifest.ts` (minimal): returns the slug taken from
    the manifest file name. The one-manifest rule stays.
  - `agent-runner/src/index.ts`: the default result path becomes
    `devdigest-result-<slug>.json`.
  - `agent-runner/src/run.test.ts`, and `agent-runner/src/artifact.test.ts`
    (new or modified).

**server (S2).**
- `server/src/db/schema/ci.ts` (modified), plus the generated
  `server/src/db/migrations/*`.
- `server/src/modules/ci/` (new):
  - `routes.ts`, `schemas.ts`, `ports.ts`, `constants.ts`
  - `service.ts` (preview, export, remove, installations)
  - `ingest.ts`
  - `repository.ts`
  - `generator/{manifest,workflow,memory,files}.ts`
  - `domain/{slug,status,artifact,secrets}.ts`
  - co-located unit tests
- Adapters:
  - `server/src/adapters/github/ci.ts` (new)
  - `server/src/adapters/runner-bundle/fs.ts` (new)
  - `server/src/adapters/mocks.ts` (modified)
- Platform:
  - `server/src/platform/container.ts` (modified)
  - `server/src/platform/config.ts` (modified)
  - `server/src/modules/index.ts` (modified)
- Dependencies: `server/package.json` and `server/pnpm-lock.yaml`, only
  via `pnpm add yaml fflate`.
- Tests: `server/test/ci-*.it.test.ts` (new).
- Docs: `server/README.md`.

**client (S3).**
- Data: `client/src/lib/hooks/ci.ts` (new) and
  `client/src/lib/hooks/keys.ts` (modified).
- Agent editor: `AgentEditor/constants.ts` and `AgentEditor.tsx`
  (modified).
- `AgentEditor/_components/CiTab/**` (new):
  - `CiTab`
  - `InstallationRow`
  - `RemoveInstallationDialog`
  - `FailCiOnSelect`
  - `ExportWizard`, with the sub-components `TargetStep`, `PreviewStep`,
    `ConfigureStep`, `InstallStep` and `WizardStepper`
- Shared components (new): `client/src/components/ci-runs-table/**` and
  `client/src/components/ci-refresh-banner/**`.
- CI Runs page (new): `client/src/app/ci-runs/page.tsx` and
  `client/src/app/ci-runs/_components/CiRunsView/**`.
- Messages: `client/messages/en/ci.json` (modified).
- Dependencies: `client/package.json` and `client/pnpm-lock.yaml`, only
  via `pnpm add yaml`.
- Docs: `client/README.md` and `client/INSIGHTS.md` (records the nav
  edit).

## 4. Contracts touched

### 4.1 Shared contracts (vendored)

Step 0 writes these into both copies. S1, S2 and S3 consume them. The exact
code is in Step 0; this section summarises it.

- **AgentManifest.** Adds `manifest_version` (int, positive, nullish) and
  `agent_id` (nullish). The studio and the runner validate with this one
  schema (AC-5).
- **New enums:**
  - `CiTrigger`: `opened | synchronize | reopened`
  - `CiPostAs`: `github_review | pr_comment | none`
  - `CiInstallMode`: `pr | manual`
  - `CiInstallationStatus`: `pending | active | outdated | removing`
  - `CiSecretStatus`: `ready | not_set | unknown`
  - `CiInstallBlock`: `multi_agent_unsupported | agent_slug_conflict`
- **CiExportInput.**
  - `triggers` is typed as `CiTrigger[]`, needs at least one, and defaults
    to `[opened, synchronize]`.
  - `post_as` is typed as `CiPostAs`.
  - New fields: `mode` (default `pr`) and `workflow` (nullish).
  - `action` and `base` are kept, but the server ignores them.
- **CiPreviewInput, CiPreview** (new).
  - `CiPreview` includes `notes[{kind, id}]`, `agent_slug`,
    `manifest_version`, `install_block` and `pr_open` (decision D-3).
  - Supporting types: `CiSecretCheck` and `CiPreviewNote`.
- **CiInstallation.** Extended with `agent_slug`, `mode`, `status`,
  `manifest_version`, `post_as`, `triggers`, `pr_url`, `removal_pr_url`,
  `last_run_at` and `last_run_status`.
- **CiRemoveResult** (new).
- **CiRun.**
  - `status` is now typed `CiRunStatus | null`.
  - Adds `repo`, `pr_title`, `verdict`, the per-severity counts,
    `job_url`, `agent_id`, `agent_slug`, `github_run_id` (a string),
    `duration_ms` and `agent_run_id`.
  - `github_url` is kept and holds the same URL as `job_url`.
- **CiRunsQuery, CiRefreshInput, CiRefreshResult** (new).
- **CiResultArtifact.**
  - Counts and cost must be non-negative.
  - New nullish fields: `verdict`, `blockers`, `agent_slug`, `agent_id`,
    `manifest_version`, `provider`, `model`, `runner_version`,
    `dependencies {reviewer_core, node}`, `commit_sha` and `repo`.
  - At ingest the server requires `repo` and `agent_slug`.
- **RunTrace.config** (`trace.ts`). Adds nullish `runner_version`,
  `dependencies`, `commit_sha` and `job_url`.

### 4.2 HTTP API

S2 produces it and S3 consumes it. Every route resolves the workspace
through `getContext`. Errors use the envelope
`{error:{code,message,details}}`.

| Route | Body / query | 200 | Errors |
|---|---|---|---|
| `POST /agents/:id/ci/preview` | `CiPreviewInput` | `CiPreview` | `404 not_found`; `422 target_not_supported \| manifest_invalid \| repo_not_connected \| validation_error`; `500 runner_bundle_missing`; 10/min |
| `POST /agents/:id/export-ci` | `CiExportInput` (bodyLimit 6 MiB) | `CiExport` | `404`; `409 agent_slug_conflict \| multi_agent_unsupported`; `422 target_not_supported \| workflow_invalid \| manifest_invalid \| file_too_large \| secret_in_export \| github_token_missing \| repo_not_connected`; `403 github_permission` (details `{permission: 'contents'\|'pull_requests'\|'workflows'}`); `502 github_error`; `500 runner_bundle_missing`; 10/min |
| `GET /agents/:id/ci/installations` | none | `CiInstallation[]` (status derived) | `404` |
| `POST /ci/installations/:id/remove` | nullish body | `CiRemoveResult` | `404`; `422 github_token_missing`; `403 github_permission`; `502 github_error`; 10/min |
| `GET /ci-runs` | `CiRunsQuery` | `CiRun[]`, newest first | `422 validation_error` |
| `POST /ci-runs/refresh` | `CiRefreshInput` (nullish) | `CiRefreshResult` | `502 github_error` (no token, or every installation failed with auth/network/rate limit); `429` |

**Preview never fails because of GitHub.** With no token, or on any GitHub
error, preview still returns, with these values:
- no existing workflow;
- `pr_open: false`;
- `OPENROUTER_API_KEY` status `unknown`;
- `GITHUB_TOKEN` status `ready` (it always is).

Only install, remove and refresh raise `github_token_missing` or
`github_error`.

### 4.3 Database

S2 owns this. The migration comes only from `pnpm db:generate`.

**`ci_installations`** adds:
- `agent_slug text not null`
- `mode text not null default 'pr'` (enum `pr | manual`)
- `manifest_version integer not null default 1`
- `post_as text not null default 'github_review'`
- `triggers text[] not null default '{opened,synchronize}'`
- `skill_slugs text[] not null default '{}'`
- `pr_url text` and `removal_pr_url text`
- `last_run_at timestamptz` and `last_run_status text`
- `updated_at timestamptz not null default now()`
- a unique index `ci_installations_agent_repo_uq (agent_id, repo)`
- an index on `repo`

Status is derived, not stored.

**`ci_runs`** adds:
- `workspace_id uuid` (FK to workspaces, cascade)
- `agent_id uuid` (FK to agents, set null)
- `agent_name`, `agent_slug`, `repo`, `pr_title` and `verdict` (all
  `text`)
- `critical`, `warning`, `suggestion`, `blockers` and `duration_ms` (all
  `integer`)
- `github_run_id bigint`
- `agent_run_id uuid` (FK to agent_runs, set null)

**`ci_runs`** indexes:
- `ci_runs_run_slug_uq`, unique on `(github_run_id, agent_slug)`
- `ci_runs_ws_ran_idx` on `(workspace_id, ran_at desc)`
- an index on `ci_installation_id`

`github_url` holds the job URL. Every column gets an explicit snake_case
name. `agent_runs` does not change.

### 4.4 Runner env and file contract

S1 and S2's generator produce it; GitHub Actions consumes it.

- **Env:**
  - `OPENROUTER_API_KEY=${{ secrets.OPENROUTER_API_KEY }}`
  - `GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }}`
  - `GITHUB_REPOSITORY` (implicit)
  - `PR_NUMBER=${{ github.event.pull_request.number }}`
  - `DEVDIGEST_POST_AS=<post_as>`
  - `DEVDIGEST_AGENT=<slug>`
- **Result file:** `devdigest-result-<slug>.json` in the workspace root.
- **Artifact name:** `devdigest-result-<slug>`.

## 5. Skills for implementer

**zod**
- Governs: Step 0 (main session), S1 memory, S2 `schemas.ts` and
  `domain/artifact.ts`, S3 hook types.
- Rules:
  - Additive `.nullish()` fields.
  - Types come from `z.infer`.
  - Untrusted input uses `safeParse`.

**typescript-expert**
- Governs: S1 result types and S2 port types.
- Rules:
  - Discriminate unions on a real difference in type.
  - No `any`.

**onion-architecture**
- Governs: S2 `modules/ci/**`, the adapters and the container.
- Rules:
  - Ports live in `ports.ts`. SDKs and fflate stay in the adapters.
  - Services take narrow ports, never `Container`.
  - The repository returns mapped shared types.
  - `domain/` is pure TS.
  - Every new adapter gets a mock.

**fastify-best-practices**
- Governs: S2 `routes.ts`.
- Rules:
  - Zod schemas for `params`, `body`, `querystring` and `response`.
  - One service call per route.
  - Per-route `rateLimit` and `bodyLimit`.
  - Errors are `AppError`s.

**drizzle-orm-patterns**
- Governs: S2 schema and repository.
- Rules:
  - Explicit snake_case names.
  - `onConflictDoUpdate` upserts.
  - The ingest write is one transaction.

**postgresql-table-design**
- Governs: the S2 migration.
- Rules:
  - `timestamptz`, `text` and `text[]`.
  - Index the FK columns.
  - Unique indexes back the upserts.

**security**
- Governs: S2 preview, export, remove and ingest; S1 memory; the S3 job
  link.
- Rules:
  - No secret value is ever read, logged or returned.
  - Scan exports for secrets.
  - The repo must be one of the workspace's repos. Paths are fixed.
  - Untrusted artifacts get a size cap, the schema, and a repo/agent
    match.
  - Only `https://github.com/` links are rendered.
  - Logs carry only ids and counts.

**react-frontend-architecture**
- Governs: all of S3.
- Rules:
  - Thin pages and PascalCase component folders.
  - Data goes through `src/lib/hooks/ci.ts`.
  - Shared components go in `src/components/<kebab>/`.
  - Logic goes in `helpers.ts`.

**react-best-practices**
- Governs: S3 components and hooks.
- Rules:
  - No server data in local state.
  - Derive during render. Effects only for external sync.

**next-best-practices**
- Governs: S3 `app/ci-runs/page.tsx`.
- Rule: `'use client'` only on `CiRunsView`, and `useSearchParams` there.

**react-testing-library**
- Governs: S3 tests.
- Rules:
  - `renderWithIntl` with the `ci` and `agents` namespaces.
  - The `src/test/user.ts` shim.
  - Role queries. Tabs are buttons. Scope `role="status"`.
  - Manual focus/blur in focus-return tests.

**design**
- Governs: S3 UI.
- Rule: screenshots first, then the main-checkout design HTML. No new
  visuals.

## 6. Architecture constraints

**Do-not-touch paths.**
- The paths are `*/vendor/shared/**`, `client/src/vendor/ui/**`,
  `server/src/db/migrations/**` and `*/pnpm-lock.yaml`.
- The only sanctioned edits to vendored files are those in Step 0, applied
  by the main session (user decision D-1).
- No implementer edits any vendor path, for any reason. That includes
  Bash, python or `sed` writes, and "fixing" a Step 0 file.
  - If a vendored contract looks wrong or incomplete, the implementer
    stops and reports to the caller.
- `.claude/hooks/**` stays unchanged.
- Migrations come only from `npx --yes pnpm@10 db:generate`.
- Lockfiles change only via `npx --yes pnpm@10 add <pkg>` in the package
  that owns them.
- `ExportWizardSteps.tsx` stays unedited. `aria-current` is handled in
  step 3.5.

**Server layering.**
- `routes.ts` → `service.ts` / `ingest.ts` → `repository.ts`, plus
  `ports.ts`.
- The ci module does not import other modules' repositories. Agents and
  skills come through a ci-local `AgentSource` port, wired in
  `container.ts`.
- The vendored `GitHubClient` is not extended. The new `CiGitHub` port is
  implemented by `adapters/github/ci.ts`.

**Client.**
- Components live in `_components/<PascalName>/`, with lowercase sibling
  files and an `index.ts`.
- Shared app-level UI lives in `src/components/<kebab-name>/`.
- Components never call `fetch`.
- Strings come from `messages/en/ci.json`.

**Tests.** Co-located, with the same base name. Server integration tests
are `server/test/<name>.it.test.ts`.

**agent-runner.**
- Keep the reviewer-core invariants: grounding, `wrapUntrusted` and the
  deterministic gate.
- The bundle stays a single file with zero runtime imports (NFR-9).
- Edits to `index.ts` stay minimal.

## 7. Steps

**Owner tags.**
- **[MAIN]**: the main session, before any implementer starts.
- **[I1]**, **[I2]**, **[I3]**: the first, second and third implementer
  runs.

Runs are sequential and own disjoint files. Each implementer writes the
tests for its own slice. No implementer edits a vendor path.

### Step 0 [MAIN]: vendored edits, applied mechanically

The user sanctioned these edits (decision D-1). Apply them exactly as
written, then run the checks in 0.6. The server copy is the master; the
client copy receives byte-identical blocks.

**0.1 `server/src/vendor/shared/contracts/eval-ci.ts`**
- **Imports:** unchanged (it already imports `Verdict`, `Provider` and
  `CiFailOn`).
- **Replace** everything from the line `export const CiTarget = …`
  through the line `export type CiResultArtifact = z.infer<typeof
  CiResultArtifact>;` with **BLOCK A** (0.3).
- **Keep:** the `// Export-to-CI + CI Runs` banner above it, and the
  `// Conformance` banner below it.

**0.2 `client/src/vendor/shared/contracts/eval-ci.ts`**
- **Import line 3** changes from

  ```ts
  import { EvalRun, EvalOwnerKind, Conformance } from './knowledge.js';
  ```

  to

  ```ts
  import { EvalRun, EvalOwnerKind, Conformance, Provider, CiFailOn } from './knowledge.js';
  ```

  The client copy has no `AgentManifest` today, so it needs `Provider`
  and `CiFailOn`.
- **Replace** the same range as in 0.1 (currently lines 133-210, from
  `export const CiTarget` to `export type CiResultArtifact …`) with the
  same **BLOCK A**.
- **Leave** every other part of the file as it is.

**0.3 BLOCK A** (identical in both `eval-ci.ts` copies):

```ts
export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** `pull_request` activity types an export can trigger on (AC-10). */
export const CiTrigger = z.enum(['opened', 'synchronize', 'reopened']);
export type CiTrigger = z.infer<typeof CiTrigger>;

/** How the runner posts results; written to the workflow as DEVDIGEST_POST_AS (AC-12). */
export const CiPostAs = z.enum(['github_review', 'pr_comment', 'none']);
export type CiPostAs = z.infer<typeof CiPostAs>;

/** "pr" = installed through a devdigest/ci PR; "manual" = zip download (AC-17). */
export const CiInstallMode = z.enum(['pr', 'manual']);
export type CiInstallMode = z.infer<typeof CiInstallMode>;

/** Derived installation status; precedence removing > outdated > active > pending (AC-25). */
export const CiInstallationStatus = z.enum(['pending', 'active', 'outdated', 'removing']);
export type CiInstallationStatus = z.infer<typeof CiInstallationStatus>;

/** Whether a repository Actions secret exists — never its value (AC-11, NFR-4). */
export const CiSecretStatus = z.enum(['ready', 'not_set', 'unknown']);
export type CiSecretStatus = z.infer<typeof CiSecretStatus>;

/** Why Install is blocked before it is attempted (AC-31, AC-32). */
export const CiInstallBlock = z.enum(['multi_agent_unsupported', 'agent_slug_conflict']);
export type CiInstallBlock = z.infer<typeof CiInstallBlock>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio WRITES this shape to `.devdigest/agents/<slug>.yaml`; the
 * agent-runner READS it. One Zod schema for both ends keeps the formats from
 * drifting. `skills` are slugs resolved to `.devdigest/skills/<slug>.md`.
 * `manifest_version` (= the agent's version) and `agent_id` are optional so a
 * manifest without them still validates.
 */
export const AgentManifest = z.object({
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch).
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy — when the posted review should BLOCK (REQUEST_CHANGES +
  // fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
  manifest_version: z.number().int().positive().nullish(),
  agent_id: z.string().nullish(),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget.default('gha'),
  /** Legacy; ignored by the server — `mode` replaces it. */
  action: z.enum(['open_pr', 'files']).default('open_pr'),
  post_as: CiPostAs.default('github_review'),
  triggers: z.array(CiTrigger).min(1).default(['opened', 'synchronize']),
  /** Legacy; ignored by the server — the base is the repo's default branch. */
  base: z.string().default('main'),
  mode: CiInstallMode.default('pr'),
  /** The workflow text as shown/edited in Preview; omitted = the generated one. */
  workflow: z.string().nullish(),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** Request body for `POST /agents/:id/ci/preview`. */
export const CiPreviewInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget,
  triggers: z.array(CiTrigger).min(1),
  post_as: CiPostAs,
});
export type CiPreviewInput = z.infer<typeof CiPreviewInput>;

export const CiSecretCheck = z.object({
  name: z.string(),
  status: CiSecretStatus,
});
export type CiSecretCheck = z.infer<typeof CiSecretCheck>;

/** Structured note; the client renders the text (e.g. kind 'openrouter_id'). */
export const CiPreviewNote = z.object({
  kind: z.string(),
  id: z.string().nullish(),
});
export type CiPreviewNote = z.infer<typeof CiPreviewNote>;

/** Response of `POST /agents/:id/ci/preview`. */
export const CiPreview = z.object({
  files: z.array(CiFile),
  secrets: z.array(CiSecretCheck),
  notes: z.array(CiPreviewNote),
  agent_slug: z.string(),
  manifest_version: z.number().int(),
  install_block: CiInstallBlock.nullable(),
  /** Whether `devdigest/ci` already has an open PR (false when unknown). */
  pr_open: z.boolean(),
});
export type CiPreview = z.infer<typeof CiPreview>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI installation (mirrors `ci_installations`; `status` is derived). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
  agent_slug: z.string(),
  mode: CiInstallMode,
  status: CiInstallationStatus,
  manifest_version: z.number().int(),
  post_as: CiPostAs,
  triggers: z.array(CiTrigger),
  pr_url: z.string().nullable(),
  removal_pr_url: z.string().nullable(),
  last_run_at: z.string().nullable(),
  last_run_status: CiRunStatus.nullable(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

/** Response of `POST /ci/installations/:id/remove`. */
export const CiRemoveResult = z.object({
  installation: CiInstallation.nullable(),
  pr_url: z.string().nullable(),
});
export type CiRemoveResult = z.infer<typeof CiRemoveResult>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  ran_at: z.string().nullable(),
  status: CiRunStatus.nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  /** Same value as `job_url` (kept for back-compat). */
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  agent: z.string().nullish(),
  duration_s: z.number().nullish(),
  repo: z.string().nullable(),
  pr_title: z.string().nullable(),
  verdict: Verdict.nullable(),
  critical: z.number().int().nullable(),
  warning: z.number().int().nullable(),
  suggestion: z.number().int().nullable(),
  /** GitHub Actions run URL; only https://github.com/ URLs are stored. */
  job_url: z.string().nullable(),
  agent_id: z.string().nullable(),
  agent_slug: z.string(),
  /** GitHub run id (bigint) as a string. */
  github_run_id: z.string(),
  duration_ms: z.number().int().nullable(),
  agent_run_id: z.string().nullable(),
});
export type CiRun = z.infer<typeof CiRun>;

/** Query of `GET /ci-runs` (querystring values arrive as strings). */
export const CiRunsQuery = z.object({
  agent: z.string().uuid().optional(),
  repo: z.string().min(1).optional(),
  status: CiRunStatus.optional(),
  source: z.enum(['ci']).optional(),
  since: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type CiRunsQuery = z.infer<typeof CiRunsQuery>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type CiRunsQueryInput = z.input<typeof CiRunsQuery>;

/** Body of `POST /ci-runs/refresh` (the route accepts no body too). */
export const CiRefreshInput = z.object({
  agent_id: z.string().uuid().optional(),
});
export type CiRefreshInput = z.infer<typeof CiRefreshInput>;

/** Response of `POST /ci-runs/refresh`. */
export const CiRefreshResult = z.object({
  ingested: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  errors: z.array(z.object({ installation_id: z.string(), code: z.string() })),
});
export type CiRefreshResult = z.infer<typeof CiRefreshResult>;

/**
 * The runner's result file (`devdigest-result-<agent-slug>.json`), uploaded as
 * the artifact `devdigest-result-<agent-slug>` and ingested on refresh. The
 * artifact is UNTRUSTED on ingest: the server also requires `repo` and
 * `agent_slug` to match the installation (AC-23).
 */
export const CiResultArtifact = z.object({
  findings_count: z.number().int().nonnegative(),
  critical: z.number().int().nonnegative().nullish(),
  warning: z.number().int().nonnegative().nullish(),
  suggestion: z.number().int().nonnegative().nullish(),
  cost_usd: z.number().nonnegative().nullable(),
  duration_ms: z.number().int().nonnegative().nullish(),
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().nullish(),
  verdict: Verdict.nullish(),
  blockers: z.number().int().nonnegative().nullish(),
  agent_slug: z.string().nullish(),
  agent_id: z.string().nullish(),
  manifest_version: z.number().int().positive().nullish(),
  provider: z.string().nullish(),
  model: z.string().nullish(),
  runner_version: z.string().nullish(),
  dependencies: z.object({ reviewer_core: z.string(), node: z.string() }).nullish(),
  commit_sha: z.string().nullish(),
  repo: z.string().nullish(), // "owner/name"
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;
```

**0.4 `trace.ts`, both copies** (`server/` and `client/`
`src/vendor/shared/contracts/trace.ts`). In `RunTrace.config`, directly
after the line

```ts
    source: z.enum(['local', 'ci']).default('local'),
```

insert these four lines, identically in both copies:

```ts
    runner_version: z.string().nullish(),
    dependencies: z.object({ reviewer_core: z.string(), node: z.string() }).nullish(),
    commit_sha: z.string().nullish(),
    job_url: z.string().nullish(),
```

**0.5 `client/src/vendor/ui/nav.ts`.** In `NAV`, after the closing `},` of
the `"SKILLS LAB"` group and before the closing `];`, insert:

```ts
  {
    section: "GLOBAL",
    items: [
      { key: "ci-runs", label: "CI Runs", icon: "Workflow", href: "/ci-runs" },
    ],
  },
```

`Workflow` is an existing `IconName` (`client/src/vendor/ui/icons.tsx`).
`activeKeyFor` (`/ci-runs` → `ci-runs`) and `shell.nav.ci-runs` already
exist.

**0.6 Checks [MAIN].**
- The CI block is identical in both copies. From the repo root:

  ```sh
  diff <(sed -n '/^export const CiTarget/,/^export type CiResultArtifact/p' server/src/vendor/shared/contracts/eval-ci.ts) <(sed -n '/^export const CiTarget/,/^export type CiResultArtifact/p' client/src/vendor/shared/contracts/eval-ci.ts)
  ```

  It must print nothing.
- `diff <(grep -A12 'export const RunTrace' server/src/vendor/shared/contracts/trace.ts) <(grep -A12 'export const RunTrace' client/src/vendor/shared/contracts/trace.ts)`
  must print nothing.
- `diff -rq server/src/vendor/shared client/src/vendor/shared`: the list of
  diverged files must be no longer than before Step 0.
- `cd server && npx --yes pnpm@10 typecheck` must pass.
- `cd client && npx tsc --noEmit` must pass.
- Known compile risk: existing code that builds `CiInstallation`, `CiRun`
  or `CiExportInput` with the old shapes. A grep found no server module
  that uses them today. If typecheck fails, report it rather than patching
  around it.
- Then hand off to I1 with the commit or line ranges.

### Slice S1 [I1]: agent-runner

- **Consumes:** the Step 0 contracts, already present. Do not edit any
  `vendor/**` file. If a contract seems wrong, stop and report.
- **Produces:**
  - runner contract 4.4;
  - a locally rebuilt `agent-runner/dist/index.js` (gitignored).

**1.1 Verify the contracts [I1].** Read-only:
- confirm that `AgentManifest` has `manifest_version` and `agent_id`;
- confirm that `CiResultArtifact` has the new fields from 0.3, as seen
  through `server/src/vendor/shared` (the agent-runner path alias).

No edits.

**1.2 (no step).** The former "client copy" step is now part of Step 0.

**1.3 Memory loader** (`agent-runner/src/memory.ts`).
- `loadMemory(devdigestDir, readFile)` returns `{kind, scope, content}[]`.
- A missing file, or one that is empty or only whitespace, returns `[]`
  (AC-19).
- Each non-blank line is parsed with `JSON.parse`, then validated with a
  runner-local Zod object: `{kind: string.min(1), scope:
  enum('global','repo'), content: string}`.
- On failure it throws `RunnerError("memory.jsonl line N: …")`, where N is
  1-based.
- Skills: zod, security.

**1.4 Wire memory into `run.ts`.**
- Pass `memory: items.map(i => wrapUntrusted('memory', i.content))` to
  `reviewPullRequest`. `wrapUntrusted` is the existing reviewer-core
  export.
- A throw keeps the existing hard-fail path: exit 1, nothing posted, no
  artifact.

**1.5 Slug and head SHA.**
- `manifest.ts`: add `loadManifestWithSlug()`, which returns `{manifest,
  slug}`. The slug is the manifest file name without its extension.
  `findManifestPath` stays as it is.
- `context.ts`: add `PrContext.headSha` (nullable), from
  `pull_request.head.sha`.

**1.6 Extended artifact (`artifact.ts`, AC-20).** Fill every new
`CiResultArtifact` field:

| Field | Source |
|---|---|
| `verdict` | the deterministic payload event: `APPROVE`→`approve`, `REQUEST_CHANGES`→`request_changes`, `COMMENT`→`comment` |
| `blockers` | from the run |
| `agent_slug` | from the run |
| `agent_id` | from the manifest (nullable) |
| `manifest_version` | from the manifest (nullable) |
| `provider`, `model` | from the manifest |
| `runner_version` | `RUNNER_VERSION`, bumped to `'2'` |
| `dependencies` | `{reviewer_core: REVIEWER_CORE_VERSION, node: process.version}` |
| `commit_sha` | `headSha` |
| `repo` | `owner/name` |

`REVIEWER_CORE_VERSION` equals `reviewer-core/package.json`'s `version`. A
test asserts this. A JSON import bundled by ncc is also acceptable.

**1.7 Slug-named result file (AC-20, decision D-6; keep the diff
minimal).**
- `RunCiDeps` gets `resultDir` and an optional `resultPath` override.
- `runCi` writes `devdigest-result-<slug>.json`. The slug is
  `env.DEVDIGEST_AGENT` when set, otherwise the manifest file name.
- `index.ts` passes `resultDir = cwd`. `DEVDIGEST_RESULT_PATH` still
  overrides the path.
- Add a comment that selecting the manifest by `DEVDIGEST_AGENT` is D-MA-1,
  which is external to this plan.

**1.8 Tests** (`memory.test.ts`, `run.test.ts`, `artifact.test.ts`).
- The prompt contains `<untrusted source="memory">` (AC-19).
- An empty or missing file produces no memory section.
- A malformed line N: exit 1, no artifact, no post, and the error contains
  `line N`.
- A fixture with every AC-20 field passes `CiResultArtifact`.
- The result file is named `devdigest-result-<slug>.json`.
- Negative counts are rejected.

**1.9 Build.**
- Run `npx --yes pnpm@10 build`.
- `grep -c "^import\|require(" dist/index.js` must output `0` (NFR-9).
- Report the size of `dist/index.js`.

### Slice S2 [I2]: server

- **Consumes:** the Step 0 contracts and `agent-runner/dist/index.js`,
  built locally.
- **Produces:** API 4.2, the database changes in 4.3, and files that
  follow 4.4.
- I2 edits no vendor path.

**2.1 Dependencies.** Run `npx --yes pnpm@10 add yaml fflate` in
`server/`.

**2.2 Schema.**
- Edit `server/src/db/schema/ci.ts` to match 4.3.
- Run `npx --yes pnpm@10 db:generate` and review the SQL without editing
  it.
- Run `npx --yes pnpm@10 db:migrate`.

**2.3 Ports** (`modules/ci/ports.ts`; no SDK types).

`CiGitHub`:

| Method | Returns / behaviour |
|---|---|
| `getBranchHead(repo, branch)` | `{commitSha, treeSha} \| null` (null on 404) |
| `listTreePaths(repo, treeSha)` | `Set<string>` (recursive) |
| `readFile(repo, ref, path)` | `string \| null` |
| `secretStatus(repo, name)` | `CiSecretStatus`: 200→ready, 404→not_set, else unknown; never throws |
| `commit(repo, {branch, parent, createBranch, message, upserts: {path, contents}[], deletes: string[]})` | `{commitSha}` |
| `findOpenPr(repo, headBranch)` | `{url, number} \| null` |
| `openPr(repo, {title, head, base, body})` | `{url, number}` |
| `prState(repo, number)` | `'open' \| 'merged' \| 'closed'` |
| `listWorkflowRuns(repo, workflowFile, sinceIso, limit)` | `CiWorkflowRun[]` (`id`, `status`, `conclusion`, `htmlUrl`, `headSha`, `createdAt`, `displayTitle`, `prNumber`, `headRepoIsFork`) |
| `findArtifact(repo, runId, name)` | `{id, sizeBytes, expired} \| null` |
| `downloadArtifactJson(repo, artifactId, maxBytes)` | `{kind:'ok', text} \| {kind:'expired'} \| {kind:'too_large'}` |

Failures throw `CiGitHubError`:
- `kind`: `permission | auth | rate_limited | network | unexpected`;
- `permission` (optional): `contents | pull_requests | workflows |
  actions`.

The other ports:
- `CiStore`;
- `AgentSource`, with `get(workspaceId, agentId)` and
  `enabledSkills(agentId)` in link order;
- `RunnerBundle`, with `read()`, which throws when the bundle is missing;
- `CiLog`.

**2.4 Adapters.**

`server/src/adapters/github/ci.ts`:
- Wrap calls in `withTimeout`. Use `withRetry` only for idempotent reads.
- `commit`:
  1. `createTree` with `base_tree`. Upserts carry `content`. Deletes carry
     `sha: null`.
  2. When there are no changes, skip `createTree` and reuse the parent
     tree. This produces the empty commit that D-8 needs.
  3. `createCommit`.
  4. `createRef`, or `updateRef(force: false)` when the branch already
     exists.
- `downloadArtifactJson`:
  1. Cap the compressed size.
  2. `fflate.unzipSync` with a filter that accepts only one `.json` entry
     whose `originalSize` is at most `maxBytes`. This blocks zip bombs.
  3. A 410 response becomes `expired`.
- Error classification:

  | GitHub response | Error |
  |---|---|
  | 401 | `auth` |
  | rate-limit headers | `rate_limited` |
  | 403 or 404 on a write | `permission` |
  | network or timeout | `network` |

  For `permission`, the permission comes from the failing call:
  - git data → `contents`, or `workflows` when the message says
    "workflow";
  - pulls → `pull_requests`;
  - actions → `actions`.

`server/src/adapters/runner-bundle/fs.ts`: reads
`config.ciRunnerBundlePath`.

`mocks.ts`:
- `MockCiGitHub`: an in-memory repo that records every call and can inject
  an error per operation.
- `MockRunnerBundle`.

**2.5 Config and container.**

Config (decision D-2):
- `ciRunnerBundlePath` comes from env `CI_RUNNER_BUNDLE_PATH`.
- It falls back to `../agent-runner/dist/index.js`, resolved from the
  server package directory.
- When the file is missing, the service throws `AppError(
  'runner_bundle_missing', 'Build agent-runner first (pnpm build in
  agent-runner)', 500)`.

Container:
- `ContainerOverrides.ciGitHub?` and `runnerBundle?`.
- `async ciGitHub()` throws `ConfigError` when there is no `GITHUB_TOKEN`.
- Singleton `ci` and `ciIngest`. `ciIngest` holds the in-flight map.
- Clear the cache in `invalidateSecretCaches`.
- `AgentSource` comes from `agentsRepo`. It returns only skills that are
  enabled on the link and enabled globally, in link order.

**2.6 Pure domain** (`modules/ci/domain/`).

`slug.ts`:
- `slugify` produces kebab-case ASCII: NFKD, strip diacritics, at most 60
  characters. An empty result becomes `agent`.
- `assignSkillSlugs`: when different skills give the same slug, the second
  and later ones get `-2`, `-3`… in link order (AC-32).

`status.ts`:
- `deriveStatus({removalPrUrl, agentVersion, manifestVersion, lastRunAt})`.
- Precedence: `removing` > `outdated` > `active` > `pending` (AC-25).

`artifact.ts`:
- `validateArtifact` runs `safeParse`. It requires `repo` and
  `agent_slug` to equal the installation's, and `agent_id` to match when it
  is present.
- `ciRunStatus`: zero findings → `no_findings`, otherwise `succeeded`
  (E-6).

`secrets.ts`:
- The server has no existing secret patterns, so these are module-local:
  - `gh[pousr]_[A-Za-z0-9]{36,}`
  - `github_pat_\w{20,}`
  - `sk-[A-Za-z0-9_-]{20,}`
  - `AKIA[0-9A-Z]{16}`
- `findSecret` returns only the path, never the matched value.

**2.7 Generators** (`modules/ci/generator/`).

`manifest.ts`:
- Provider mapping (AC-6):
  - `openai` or `anthropic` → provider `openrouter`, model
    `<provider>/<model>`;
  - `openrouter` is kept as is.
- The manifest has every field from AC-5.
- It is checked with `safeParse`. Failure → `422 manifest_invalid {fields}`.
- Rendered with `yaml.stringify(…, {lineWidth: 0})`.
- Returns `{yaml, openrouterId}`.

`memory.ts`: one `{kind, scope, content}` JSON object per line. An empty
list gives an empty string (AC-7).

`workflow.ts`:
- `renderAgentJob(slug, postAs)`, with these job settings:
  - `if: github.event.pull_request.head.repo.full_name == github.repository`
  - `permissions: {contents: read, pull-requests: write}`
  - `runs-on: ubuntu-latest`
- and these steps:
  1. `actions/checkout@v4` with the head SHA;
  2. `actions/setup-node@v4` with `node-version: 22`;
  3. `node .devdigest/runner/index.js` with the env from 4.4;
  4. `actions/upload-artifact@v4` with `if: always()`, name
     `devdigest-result-<slug>`, path `devdigest-result-<slug>.json`,
     `if-no-files-found: ignore`.
- `mergeWorkflow(existing | null, slug, triggers, postAs)`:
  - with no existing file, build a new document named "DevDigest Review";
  - otherwise use `yaml.parseDocument` and set only
    `on.pull_request.types` and `jobs.<slug>`, then
    `toString({lineWidth: 0})`.
- `removeAgentJob(text, slug)` returns the new text, or `null` when no
  jobs remain.
- `validateWorkflow(text)` → `422 workflow_invalid {line}`.

`files.ts`:
- Returns the files in AC-4 order: the manifest, the skills in link order,
  `memory.jsonl`, the runner (`editable: false`) and the workflow
  (`editable: true`).
- Paths come only from constants.

**2.8 Repository.**

Reads:
- `repoForWorkspace` returns `{id, fullName, defaultBranch}`.
- `memoryForExport` returns items with scope `global`, or scope `repo` for
  this repo. It reads only `kind`, `scope` and `content`.

Installations:
- `listInstallationsByAgent` and `listInstallationsByRepo`.
- `getInstallation` joins through agents, for tenancy.
- `upsertInstallation`, with conflict on `(agent_id, repo)`.
- `setRemovalPr`, `clearRemovalPr`, `deleteInstallation` and
  `setLastRun`.

Runs:
- `listRuns`: newest first, limited.
- `oldestRunningRunAt` and `lastTerminalRunAt`.
- `findRun` and `prIdFor`.
- `ingestRun({ciRun, agentRun?, trace?})` runs in one transaction. It
  inserts `agent_runs` and `run_traces` only when the existing `ci_runs`
  row has no `agent_run_id`, then upserts `ci_runs` and sets
  `agent_run_id` (AC-22).

Mappers turn rows into the shared types.

**2.9 CiService** (`service.ts`). Ports: `{store, agents, github: () =>
Promise<CiGitHub>, bundle, log}`.

**`preview(ws, agentId, input)`**
1. The target must be `gha`, else `422 target_not_supported` (AC-3).
2. The repo must be connected, else `422 repo_not_connected`.
3. Build the files: enabled skills, slugs, the manifest, the memory file
   and the runner bundle.
4. GitHub, best effort:
   - use the ref `devdigest/ci` when it exists, else the default branch;
   - read the existing workflow;
   - read the `OPENROUTER_API_KEY` secret status;
   - check for an open PR on `devdigest/ci`;
   - on a `ConfigError` or any GitHub error: no existing workflow, status
     `unknown`, `pr_open: false`.
5. Merge the workflow.
6. Set `install_block` from the database:
   - `agent_slug_conflict` when another agent id in this repo has the same
     slug;
   - otherwise `multi_agent_unsupported` when any other agent is installed
     in this repo.
7. `secrets` is `[{OPENROUTER_API_KEY, status}, {GITHUB_TOKEN, 'ready'}]`.

**`export(ws, agentId, input, log)`**

Regenerate everything on the server. Only the workflow text comes from the
client. Check in this order:
1. target;
2. repo;
3. slug conflict → `409`;
4. multi-agent gate → `409`; this also blocks zip installs (AC-31);
5. `validateWorkflow`;
6. any file over 5 MB → `422 file_too_large`;
7. `findSecret` → `422 secret_in_export`.

*`manual` mode* (AC-17):
- no GitHub calls;
- upsert the installation with `mode: 'manual'`, `manifest_version`,
  `triggers`, `post_as`, `agent_slug` and `skill_slugs`;
- `pr_url` and `removal_pr_url` are null.

*`pr` mode:*
1. A missing token gives `422 github_token_missing`.
2. Get the head: `devdigest/ci`, or the default branch with
   `createBranch`. If neither exists, `502`.
3. Commit all files in one commit.
4. When the branch already existed, call `findOpenPr`.
5. When no PR is open, call `openPr`. The title is "Add DevDigest CI
   review", or "Update DevDigest CI review" when an installation already
   exists (AC-14, AC-28).
6. Only after that succeeds, upsert the installation: `mode: 'pr'`,
   `pr_url`, the version, triggers and post_as, the slugs, and
   `removal_pr_url: null`. `last_run_*` is kept.

Error mapping (AC-16):
- `permission` → `403 github_permission {permission}`;
- anything else from GitHub → `502 github_error`.

On any error, no installation change is recorded.

GitHub call budget: at most 7.

Log line (NFR-6): `{agentId, repo, mode, files: count, outcome, prUrl}`.

**`remove(ws, installationId, log)`** (AC-34..36, D-8)
1. Get the head as in export.
2. `listTreePaths`.
3. `others` = the remaining installations in the repo.
4. Delete these files, when present:
   - this agent's manifest;
   - its `skill_slugs` that no installation in `others` lists;
   - when `others` is empty: `memory.jsonl`, the runner and the workflow.
5. When `others` is not empty, rewrite the workflow with
   `removeAgentJob`.
6. Commit. If nothing changed, the commit is empty.
7. Find or open the PR titled "Remove DevDigest CI review".
8. `setRemovalPr`. The response returns the installation with status
   `removing`.

Errors use the same mapping and leave the installation unchanged (AC-36).
GitHub call budget: at most 8.

**`listInstallations`** derives `status` with `deriveStatus`.

**2.10 CiIngestService** (`ingest.ts`).

The in-flight map joins a trigger that arrives while a refresh is running
(AC-21).

**`refresh`** throws `502 github_error` when there is no token, or when
every installation failed with `auth`, `network` or `rate_limited`. Stored
rows are kept (AC-24).

**Per installation:**
1. `since` starts from the oldest running run or the last terminal run,
   floored at 30 days ago.
2. `listWorkflowRuns(…, 'devdigest-review.yml', since, 50)` (NFR-2).
3. Skip fork runs.
4. A run still in progress: upsert a `running` ci_run.
5. A completed run:
   - already has an `agent_run_id`: skip it;
   - artifact expired: skip it;
   - no artifact and conclusion `failure` or `cancelled`: write a `failed`
     `agent_runs` row (error "CI run produced no result") and a `failed`
     ci_run with the job URL, in one transaction (AC-23);
   - over 5 MB, or the download is `too_large`: warn and store nothing;
   - invalid artifact: warn with the GitHub run id and store nothing;
   - valid artifact: write the `agent_runs` row (`ci`, `done`), the trace
     and the ci_run, in one transaction.
6. The trace is a full `RunTrace`:
   - `config` gets `source: 'ci'`, `version` (the manifest version),
     `runner_version`, `dependencies`, `commit_sha` and `job_url`;
   - `prompt_assembly` is empty;
   - the other fields are empty arrays.
7. Call `setLastRun`.
8. When a removal PR is set, check its state:
   - merged → delete the installation (the runs are kept);
   - closed → `clearRemovalPr`;
   - open → no change.
9. Log line (NFR-6).

`job_url` is stored only when it starts with `https://github.com/`.

**2.11 Routes.**
- The six routes from table 4.2, with the Step 0 schemas.
- 10/min rate limit on preview, export, remove and refresh.
- `bodyLimit` of 6 MiB on export.
- `.nullish()` bodies on remove and refresh.
- Register the module in `modules/index.ts`.

**2.12 Unit tests.**
- `domain/slug`, `status`, `artifact` and `secrets`.
- `generator/manifest`: round-trip, provider mapping, and the runner's
  `yaml.parse` + `AgentManifest.parse` (AC-5, AC-6).
- `generator/workflow`: every AC-8 item, a byte-identical merge of job A,
  `removeAgentJob`, and each post-as value.
- `generator/memory`.
- `service` and `ingest`, with fakes: error mapping, call budgets
  (NFR-1), the in-flight join.

**2.13 Integration tests** (`server/test/ci-*.it.test.ts`; the mock
override is mandatory).
- `ci-preview.it`: AC-3, 4, 7, 11.
- `ci-export.it`: AC-14, E-4, AC-16, 17, 31, 32, `workflow_invalid`,
  `file_too_large`, `secret_in_export`, AC-28, AC-27 outdated, and AC-15
  byte-identical (with A's installation seeded directly).
- `ci-remove.it`:
  - A and B installed: removing A leaves B's files byte-identical;
  - removing the last agent (E-18);
  - never committed (D-8);
  - removal PR merged or closed (AC-35);
  - errors (AC-36).
- `ci-ingest.it`:
  - AC-21: three runs, three fetches; concurrent refreshes, one set of
    calls;
  - AC-22: ingesting twice creates no duplicates;
  - AC-23: each case;
  - AC-24: a `502` keeps the stored rows;
  - `GET /ci-runs` filters, order, and `422` for a bad filter.
- `ci-rate-limit.it`: production-mode app, NFR-3.

**2.14 Docs.**
- `server/README.md`: the routes and `CI_RUNNER_BUNDLE_PATH`.
- Root `README.md` architecture: the pull-ingest boundary, as one sentence
  plus one edge in the diagram.

### Slice S3 [I3]: client

- **Consumes:**
  - the Step 0 contracts in `client/src/vendor/shared`;
  - the Step 0 GLOBAL "CI Runs" nav entry, which is already present;
  - API 4.2.
- I3 does not edit any `vendor/**` file. If the nav entry or a contract is
  missing or wrong, stop and report.

**3.1 Dependencies.** Run `npx --yes pnpm@10 add yaml` in `client/`.
`fflate` is already a dependency.

**3.2 Data hooks** (`src/lib/hooks/ci.ts` and `keys.ts`).
- `useCiInstallations` and `useCiRuns`.
- `useCiPreview`, a mutation.
- `useExportCi` and `useRemoveCiInstallation`, mutations that invalidate
  the CI queries.
- `useCiAutoRefresh(agentId?)`:
  - a `useQuery` that POSTs to `/ci-runs/refresh`;
  - `refetchInterval: 60_000`, `refetchIntervalInBackground: false` and
    `refetchOnWindowFocus: true`;
  - invalidates the runs and installations;
  - returns `{refresh, isRefreshing, error}`.

If the global mutation-error toast would duplicate an inline error, opt
these mutations out. Reuse `useUpdateAgent` for "Fail CI on".

**3.3 Shared components.**

`src/components/ci-runs-table/` (AC-30):
- the columns: Timestamp, Repository, Pull request, Agent, Source, Dur.,
  Findings, Verdict, Cost, Status, Job;
- unknown values show `—`;
- the job link renders only for `https://github.com/` URLs, with
  `target="_blank"` and `rel="noopener noreferrer"`;
- truncation with the full text in a tooltip;
- loading skeleton, an error state with a Retry `Button`, and the empty
  state.

`src/components/ci-refresh-banner/` (AC-24).

**3.4 CI tab.**
- Add the `ci` tab after `stats`.
- `CiTab`:
  - with installations: the heading, the "Active in N repos" badge (N
    counts `active` and `outdated`), the two buttons, the rows, and "Add
    repository";
  - with none: the empty state;
  - `FailCiOnSelect` (AC-27);
  - "Recent CI runs": 10 rows and a "View all" link to
    `/ci-runs?agent=<id>` (AC-29);
  - the auto-refresh and the banner.
- `InstallationRow` (AC-26), with a Remove action whose accessible name is
  "Remove <agent> from <repo>".
- `RemoveInstallationDialog` (AC-33, 36): an `AccessibleModal` with
  `returnFocusTo`.

**3.5 Wizard shell.**
- A reducer in `helpers.ts`, and `useExportWizard`.
- Three modes:
  - `add`: the active repo;
  - `add-repository`: a select that filters out installed repos;
  - `update`: opens at Preview with prefilled values (AC-28).
- `AccessibleModal` provides the focus trap, Esc and focus return.
- `WizardStepper`: the vendored `ExportWizardSteps` marked `aria-hidden`,
  plus a visually hidden `<ol>` carrying `aria-current="step"`.
- The footer has Back and Continue, then "Install" / "Installing…" on the
  last step.

**3.6 TargetStep.** A radio group. The stub cards carry `aria-disabled`,
"Coming soon", and cannot be selected (AC-3).

**3.7 PreviewStep.**
- The file list and the read-only versus editable panes (AC-4).
- The workflow is parsed with `yaml.parseDocument` on every change. A
  parse error shows its line and disables Continue (AC-9).
- The OpenRouter note (AC-6).
- The pane scrolls (E-15).

**3.8 ConfigureStep.**
- The trigger chips (AC-10).
- The secret rows and badges, with the screenshot-5 description (AC-11).
- The post-as radio group (AC-12).
- The info note.
- A change re-runs the preview, unless the workflow was edited. Then the
  edited text is kept and the warning shows (AC-9).

**3.9 InstallStep.**
- The two radio cards, with N equal to the number of files (AC-13).
- The "GitHub Action setup docs" link (decision D-5) points to
  `https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions`.
  It opens in a new tab with `rel="noopener noreferrer"`.
- The `install_block` or a `409` disables Install, with the message
  (AC-31, AC-32).
- PR success: the "PR opened" panel (AC-14).
- Zip:
  - `fflate.zipSync` builds the archive;
  - the download is named `devdigest-ci-<slug>.zip` (AC-17).
- Errors are mapped from `ApiError.code` and `details.permission`, and
  offer Retry (AC-16).

**3.10 CI Runs page.**
- `page.tsx` renders `CiRunsView`.
- `CiRunsView` shows:
  - the title, the subtitle, the "auto-refresh on" indicator and Refresh;
  - the filters, with the time options taken from the design HTML;
  - the table and the banner.
- `?agent=` sets the initial agent filter.
- **Nav:** Step 0.5 already added the GLOBAL group with "CI Runs"
  (decision D-4). I3 only checks it in the browser and records it in
  `client/INSIGHTS.md` as the fourth local `nav.ts` edit. That entry says
  it was applied by the main session with user sanction, and that it must
  be ported to the sync source.

**3.11 Messages.** Add only the missing `ciTab`, `exportWizard` and `runs`
keys, and reuse the existing ones.

**3.12 Tests.**
- `CiTab`: AC-1, 24, 27, 29.
- `InstallationRow`: AC-26.
- `RemoveInstallationDialog`: AC-33, 36.
- `ExportWizard`: AC-2, 28.
- `TargetStep`: AC-3.
- `PreviewStep`: AC-4, 6, 9.
- `ConfigureStep`: AC-9, 10, 11, 12.
- `InstallStep`: AC-13, 14, 16, 17, 31, plus the docs link `href` and
  `rel`.
- `CiRunsTable` and `CiRunsView`: AC-30.

## 8. Acceptance checks

**Step 0 [MAIN].** Run the checks in 0.6.

**S1 [I1].** Covers AC-5 (runner side), AC-19, AC-20 and NFR-9.
- If `reviewer-core` has no `node_modules`, run `cd reviewer-core && npx
  --yes pnpm@10 install` first.
- `cd agent-runner && npx --yes pnpm@10 typecheck && npx --yes pnpm@10 test
  && npx --yes pnpm@10 build`.
- `grep -c "^import\|require(" agent-runner/dist/index.js` prints `0`.
- `git diff --stat -- '*/vendor/**'` shows no changes made by I1.

**S2 [I2].** Covers AC-3 through 8, 11, 14 through 17, 21 through 25, 27,
28, 31, 32 and 34 through 36, plus NFR-1, 3, 4 and 6.
- `cd server && npx --yes pnpm@10 typecheck && npx --yes pnpm@10 test`.
  Docker must be running.
- `db:generate` produces exactly one new migration, and only generated
  files change. Then run `db:migrate`.
- Targeted runs: `npx vitest run test/ci-` and `npx vitest run
  src/modules/ci`.
- I2 makes no vendor changes.

**S3 [I3].** Covers AC-1 through 4, 6, 9 through 14, 16, 17, 24, 26
through 31, 33 and 36, plus NFR-7 and 8.
- `cd client && npx tsc --noEmit && npx vitest run && npx eslint src`.
- Targeted runs, by base name: `npx vitest run CiTab InstallationRow
  RemoveInstallationDialog ExportWizard TargetStep PreviewStep ConfigureStep
  InstallStep CiRunsTable CiRunsView`.
- I3 makes no vendor changes.

**Browser check.** Use the dev servers that are already running.
- Compare the wizard steps with screenshots 1, 3, 5 and 6, and the CI tab
  with screenshot 2.
- Preview: invalid YAML disables Continue.
- Configure: toggle the triggers and post-as.
- Zip download.
- The CI Runs page from the GLOBAL sidebar item, compared with the design
  HTML.
- The banner shows when the token is removed.
- The Remove dialog closes on Esc and returns focus.
- Optional, run by the user: a real PR install against a test repo.

**After the implementers.** check-runner runs once over agent-runner,
server and client. The architecture-reviewer and the plan-verifier reuse
its report.

## 9. Risks & open questions

**Open questions: none.** The user resolved all of them; see section 11.

**Risks and ACs that are disproportionately expensive.**
- **AC-15 / AC-4, byte-identical jobs.** The `yaml` Document API keeps
  untouched nodes in practice, but it does not guarantee this for
  hand-formatted files. The tests cover generated files only. The
  alternative is a text splice between marker comments. Flag for the
  architecture-reviewer.
- **Shared triggers.** One workflow file means `on.pull_request.types`
  applies to every agent, which conflicts with AC-15. It does not matter
  while AC-31 is in force; flag it to the spec owner before D-MA lands.
- **NFR-1 for Remove.** The worst case is exactly 8 calls. A stale
  `default_branch` in the database gives a `502`.
- **AC-4 payload.** The whole runner bundle (an estimated 1-3 MB) travels
  in every preview response.
- **D-8, empty-commit PR.** Not verified against GitHub. It needs one
  manual check.
- **AC-16, permission naming.** It is a heuristic; fine-grained PATs can
  return 404 instead of 403.
- **AC-34 skill references.** They come from the database `skill_slugs`, so
  a repo edited by hand can drift.
- **E-2.** Whether a workflow added by a PR runs on that same PR is not
  confirmed by GitHub's docs.
- **Step 0 compile risk.** The required fields added to `CiInstallation`
  and `CiRun` would break any existing code that builds the old shapes.
  None was found; the 0.6 typecheck covers it.
- **Q6 merge.** The slug-named result file in `index.ts` and `run.ts` will
  overlap with the user's D-MA worktree. The diff is kept minimal.
- **For the architecture-reviewer:**
  - the new port, instead of extending the vendored `GitHubClient`;
  - the CI trace with an empty `prompt_assembly`;
  - the ingest transactions;
  - the derived status.
- **For the security reviewer:**
  - the unzip limits;
  - the secret patterns;
  - the `job_url` allow-list;
  - no prompt or memory text in logs;
  - tenancy checks;
  - memory content exported into the repository (an accepted product
    decision).

## 10. Could not determine

- **The size of `agent-runner/dist/index.js`.** It is not built here. S1
  reports it.
- **The design HTML details** for the CI Runs page, the CI tab empty
  state, "Fail CI on" and "Recent CI runs". The file is in the main
  checkout (section 2). S3 checks it there; this does not block the work.
- **How the client's global mutation-error toast is wired.** It is
  mentioned only in `ConfigTab.tsx`. S3 checks it.
- **The icon for the CI tab.** S3 picks it from the existing `IconName`
  values. The nav icon is fixed as `Workflow`.
- **`getContext` / `IdParams`.** I saw them only as used in
  `brief/routes.ts`.

## 11. Requirements review

**From the caller's first prompt (quoted).**
- Scope: "implement the full spec as written, with no MVP cuts ... at each
  step choose the simplest implementation that satisfies the AC, and flag
  any AC you see as disproportionately expensive." The flags are in
  section 9.
- Remove: "exactly as in the spec (AC-33..36, `removing` status, D-7,
  D-8)."
- Multi-manifest: "NOT part of this plan. Plan AC-31 as the temporary gate,
  and make sure the generated workflow already uses `DEVDIGEST_AGENT` and
  the slug-named artifact."

**Decisions** (user answers relayed by the coordinator, 2026-10-17).
- **D-1 (was Q1), vendored edits.** "the user allows them. The main session
  (not an implementer) will apply exactly those edits before implementer 1
  starts ... Do not change the hook." These are Step 0 (0.1-0.5).
  Implementers 1, 2 and 3 consume the edits as already present and never
  edit vendor paths.
- **D-2 (was Q2), runner bundle path.** "`CI_RUNNER_BUNDLE_PATH` with
  fallback `../agent-runner/dist/index.js`, and `500 runner_bundle_missing`
  when the file is absent." See step 2.5.
- **D-3 (was Q3), extra preview fields.** Accepted: `install_block`,
  `agent_slug`, `manifest_version` and `pr_open` (in Step 0's
  `CiPreview`).
- **D-4 (was Q4), nav.** Accepted: a GLOBAL group with CI Runs only (Step
  0.5).
- **D-5 (was Q5), docs link.** Accepted: it points to GitHub's "Using
  secrets in GitHub Actions" page (step 3.9).
- **D-6 (was Q6), result file.** Accepted: implementer 1 implements the
  slug-named result file with a minimal diff (step 1.7).

**Gaps and conflicts found.**
- The spec numbers its screenshots 1, 2, 3, 5 and 6. The supplied images
  were mapped by content.
- There is no `design/` folder in this worktree.
- There is no sync source for the vendored files. D-1 resolves this.
- The preview API could not show AC-31 or AC-32 before Install. D-3
  resolves this.
- The vendored stepper has no `aria-current`. A visually hidden list
  provides it.
- Shared triggers conflict with per-agent independence (see section 9).
- The location of the runner bundle was unspecified. D-2 resolves this.
- The agent-runner `post_as` open question is resolved by AC-12.
- The old `ciTab` and `publishDialog` messages are reused only where they
  match.

**Recommendations.**
- **A module-local `CiGitHub` port**, assumed accepted. It needs no
  further vendor edit and follows the `PriorPrSource` precedent.
- **Derived status.** No stale stored state.
- **Database-based gating and skill references**, which keep NFR-1 within
  budget.
- **`refetchInterval` polling.** The interval pauses when the page is
  hidden.
- **Marker-comment job blocks** for byte-identical merges. Optional and
  not applied.

## 12. Execution mode

**Multi-agent.** The user's words: "multi-agent, with at most 3
`implementer` runs, sequential, each owning a disjoint set of files ... Each
implementer writes the tests for its own part, so there is no separate
test-writer. After the implementers run `check-runner` (once), then
`architecture-reviewer`, then `plan-verifier`. The reviewer and the verifier
reuse the check-runner report instead of re-running suites."

**Sequence:**
0. The main session runs Step 0 (0.1-0.6).
1. I1 runs slice S1 (1.1, 1.3-1.9).
2. I2 runs slice S2 (2.1-2.14).
3. I3 runs slice S3 (3.1-3.12).
4. check-runner.
5. architecture-reviewer.
6. plan-verifier.

There are no parallel lanes.

**Hand-offs:**
- **Main → I1, I2, I3:** the Step 0 files, passing the 0.6 checks, with
  the commit or line ranges.
- **I1 → I2, I3:** runner contract 4.4, plus the bundle's path and size.
- **I2 → I3:** API 4.2, plus a report of any deviations from it. I3 starts
  only after reading that report.

Each implementer runs only its own checks from section 8. The final run
across all packages belongs to check-runner.
