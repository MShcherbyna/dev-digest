# Development Plan: Quality subagents (test-writer, architecture-reviewer, plan-verifier, doc-writer)

## 1. Goal & scope

**Goal.** Add four Claude Code project subagents under `.claude/agents/` that
extend the existing `planner → implementer` pipeline, following the
conventions of `planner.md`, `implementer.md` and `researcher.md` (frontmatter
fields, per-agent `PreToolUse` guard hooks wired in frontmatter, report-style
output formats, `.claude/agents/README.md` as the map):

1. **test-writer** — writes tests for UI (`client/`) and backend (`server/`,
   `reviewer-core/`) and applies the matching project skills.
2. **architecture-reviewer** — no write permission; checks architectural
   boundaries and returns findings with evidence.
3. **plan-verifier** — checks finished code against **all** items of the plan
   and the requirements, instead of giving generic advice.
4. **doc-writer** — documents implemented features, turns a plan or other
   material into documentation with diagrams, and knows which docs sections to
   write to.

Deliverables: 4 agent files, 3 new guard hooks, and an updated
`.claude/agents/README.md`. Target pipeline after this change:

```
task ─► planner ─► plan ─► implementer ─► test-writer ─► architecture-reviewer ─┐
                                                        plan-verifier ◄──────────┘
                                                             │ COMPLETE
                                                             ▼
                                                         doc-writer
researcher ── standalone
```

**Non-goals.**
- No security-reviewer agent (still "done by other agents"; out of scope).
- No changes to `planner.md`, `implementer.md`, `researcher.md`, the
  `pr-self-review` skill, `checks.sh`, `settings.json` or `settings.local.json`.
- No dependency-cruiser / ArchUnitTS config (`.dependency-cruiser.cjs`) in this
  task. `server/` already depends on `dependency-cruiser` for repo-intel, but a
  rule config is a separate decision (see §9 Q5).
- No new project skills. The agents reuse the existing skills.
- No e2e flow authoring by test-writer (`e2e/specs*/*.flow.json`). See §9 Q7.
- No app code, DB, contract or UI changes. No browser check is needed for this
  task itself.

## 2. Context read

Files read:
- `/CLAUDE.md` = `/AGENTS.md` (same content), `server/AGENTS.md`,
  `client/AGENTS.md`, `reviewer-core/AGENTS.md`, `e2e/AGENTS.md`.
- `INSIGHTS.md` (root), `server/INSIGHTS.md`, `client/INSIGHTS.md`,
  `reviewer-core/INSIGHTS.md`, `e2e/INSIGHTS.md` (empty sections).
- `.claude/agents/planner.md`, `implementer.md`, `researcher.md`, `README.md`.
- `.claude/hooks/planner-guard.sh`, `implementer-guard.sh`,
  `pr-self-review-gate.sh`, `duration-hook.sh`; `.claude/settings.json`,
  `.claude/settings.local.json`.
- `.claude/skills/README.md` (catalog of 15 skills) and the SKILL.md files of
  `engineering-insights`, `onion-architecture`, `react-frontend-architecture`,
  `fastify-best-practices` (+ `rules/testing.md`), `react-testing-library`,
  `mermaid-diagram`, `design`, `security` (first 80 lines), `pr-self-review`
  (+ `routing.md`, `severity.md`, `scripts/checks.sh`).
- `TESTING.md`; `docs/agent-prompts/README.md`; `server/docs/README.md`,
  `client/docs/README.md`, `reviewer-core/docs/README.md`,
  `e2e/docs/README.md`, `server/specs/README.md`; README heading lists of
  root, `server/`, `client/`, `reviewer-core/`, `e2e/`,
  `server/src/modules/repo-intel/README.md`.
- Test setup: `client/package.json`, `client/vitest.config.ts`,
  `client/src/test/user.ts`, `client/src/test/render-intl.tsx`,
  `client/src/app/skills/_components/SkillsList/SkillsList.test.tsx`;
  `server/package.json`, `server/vitest.config.ts`,
  `server/test/helpers/pg.ts`, `server/test/routes-smoke.test.ts`,
  `server/test/skills.it.test.ts`; listing of `server/test/*.ts` and
  `reviewer-core/test/*.ts`.

Relevant entries (quoted):
- `/CLAUDE.md` "Naming conventions": "**Tests**: co-located next to what they
  test, same base name — `<Name>.test.tsx` (client) / `<name>.test.ts` (server
  unit) / `<name>.it.test.ts` (server integration, Testcontainers-backed — the
  `.it.` infix is how `test/` distinguishes the two)."
- `/CLAUDE.md` "Do-not-touch": "`*/vendor/shared/**`, `client/src/vendor/ui/**`
  … `server/src/db/migrations/**` … `*/pnpm-lock.yaml`".
- `client/INSIGHTS.md` (2026-09-20): "`@testing-library/user-event` is NOT a
  client dependency (only `@testing-library/react` + `jest-dom`), and lockfiles
  are do-not-touch, so component tests use the `fireEvent`-based shim
  `src/test/user.ts` (`click`/`type`/`clear`/`upload`; `type` appends in one
  change event) and `src/test/render-intl.tsx`".
- `client/AGENTS.md` "Gotchas": "Component tests mock `fetch` (vitest + jsdom);
  they don't need the API or a browser. Real browser journeys belong in
  [`../e2e`]".
- `TESTING.md`: "We do **not** chase line coverage. Each suite covers the
  *kinds* of things that can break in that layer — one happy path plus the
  edge that actually matters per workflow"; "A DB-backed test that imports
  `test/helpers/pg.ts` must use the `.it.test.ts` suffix."; "Reach for
  `src/adapters/mocks.ts` (MockLLMProvider, MockGitClient) rather than real
  network/keys."
- `server/INSIGHTS.md` (2026-09-20): "`assemblePrompt` unit tests … live in
  `server/test/prompt-*.test.ts` as well as `reviewer-core/test/` … Grep
  before changing a slot".
- Root `INSIGHTS.md` Tool & Library Notes (2026-09-18): "`pnpm` is not on
  `PATH`, and `corepack pnpm` fails with `EACCES` … use `npx --yes pnpm@10
  <cmd>` instead".
- Root `INSIGHTS.md` Decisions (2026-09-18): "Invoke best-practices skills
  proactively during implementation … adjacent code shows what was done before,
  not whether it was a best practice worth repeating."
- `server/docs/README.md`: "one file per topic (e.g. `repo-intel-indexing.md`,
  `grounding-gate.md`). Link a new file from [`../AGENTS.md`] under "Read when"
  once it exists; don't duplicate what `../README.md` already covers." (same
  rule in `client/docs/`, `reviewer-core/docs/`, `e2e/docs/`).
- `/CLAUDE.md` "Read when": "read [README.md](README.md#architecture) (mermaid
  diagram lives there — do not duplicate it here)."
- `engineering-insights` SKILL: "When an entry becomes stable reference
  material, promote it into `<module>/docs/` and delete it here."
- `.claude/agents/README.md` "Adding an agent": "Add `<name>.md` with
  frontmatter (`name`, `description`, `model`, `tools` / `disallowedTools`,
  optional `skills`, `hooks`), then add a row and a card here."
- `pr-self-review/severity.md`: rule ids `det/layer-route-repo`,
  `det/layer-service-infra`, `det/client-imports-server`, `onion/raw-rows`,
  `onion/service-new-infra`, `frontend/server-client-boundary`,
  `next/server-leak`, etc. "Reuse the ids above whenever one applies so
  waivers stay stable."

Facts found in code that the agent prompts must encode:
- Server tests are **not** next to source: all live in `server/test/*.ts`
  (`server/vitest.config.ts` includes `test/**/*.test.ts` and
  `src/**/*.test.ts`, and no `src/**/*.test.ts` exists). reviewer-core tests
  are in `reviewer-core/test/`. Client tests are co-located.
- Server route tests use `buildApp({ config, overrides })` +
  `app.inject(...)` + `await app.close()` (`server/test/routes-smoke.test.ts:15-19`).
  Integration tests gate on `dockerAvailable()` and use `startPg()` +
  `seed()` (`server/test/skills.it.test.ts:10-28`).
- The `fastify-best-practices` testing rule shows `node:test`; this repo uses
  vitest (`server/package.json` `"test": "vitest run"`). The repo wins.
- `react-testing-library` SKILL mandates `@testing-library/user-event` and MSW;
  neither is installed (`client/package.json`). Existing tests use
  `import userEvent from "@/test/user"` and `renderWithIntl`
  (`SkillsList.test.tsx:3-4`).
- `implementer-guard.sh:7-14` fails **open**: if JSON parsing fails, `tool` is
  empty and the script exits 0. New guards must fail closed.
- The only root `docs/` sections are `docs/agent-prompts/` and `docs/plans/`.
  Every package has `docs/README.md`, `specs/README.md`, `README.md`,
  `AGENTS.md`, `INSIGHTS.md`. Module-level README precedent:
  `server/src/modules/repo-intel/README.md` (has a mermaid pipeline).

## 3. Affected modules

Repo tooling (`.claude/`) only. No package source changes.

- `.claude/agents/test-writer.md` (**new**): agent definition.
- `.claude/agents/architecture-reviewer.md` (**new**): agent definition.
- `.claude/agents/plan-verifier.md` (**new**): agent definition.
- `.claude/agents/doc-writer.md` (**new**): agent definition.
- `.claude/hooks/readonly-bash-guard.sh` (**new**): PreToolUse(Bash) allowlist
  with two modes, `git` (architecture-reviewer) and `verify` (plan-verifier).
- `.claude/hooks/test-writer-guard.sh` (**new**): PreToolUse(Bash|Edit|Write)
  guard for test-writer.
- `.claude/hooks/doc-writer-guard.sh` (**new**): PreToolUse(Edit|Write) guard
  for doc-writer.
- `.claude/agents/README.md` (**modified**): overview rows, workflow, cards,
  sources (repo and external).
- Root `INSIGHTS.md` (**modified, conditional**): only if something
  non-obvious comes up (engineering-insights gate).

## 4. Contracts touched

none. No Zod schemas, API, DB schema or shared types. No vendored copies.

The implicit contracts between agents (these are inputs and outputs, not code):
- test-writer, architecture-reviewer and plan-verifier consume the
  **Implementation Report** "Done" / "Handoff to review" sections
  (`implementer.md:71-90`) and the **Development Plan** 10-section format
  (`planner.md:74-99`), both unchanged.
- plan-verifier consumes `docs/plans/<feature>_en.md` (the English copy is
  canonical; the `_uk` copy is a translation).
- doc-writer consumes the plan, the specs (`<pkg>/specs/<feature>.md`), the
  plan-verifier report and the code.

## 5. Skills for implementer

| Skill | Governs | Key rules for this task |
|---|---|---|
| engineering-insights | Step 0 (initiation) and Step 13 (record) | Read root `INSIGHTS.md` first (cross-cutting `.claude/` work). Record at most 3 entries, only non-obvious ones, and dedupe first. |
| security | Steps 1–3 (guard hooks) | Fail closed: a parse error or unknown tool means exit 2, never allow. Treat the Bash `command` as attacker-controlled text (A05 injection). Anchored allowlists beat denylists. Reject shell metacharacters before matching. |
| react-testing-library | Step 5 (test-writer prompt body) | The prompt must keep the query priority (`getByRole` first, `getByTestId` last), `screen`, `findBy`, "1-3 flow tests per component", and "mock at boundaries only". The prompt must also name the repo overrides (shim `@/test/user`, no MSW) so it does not contradict the repo. |
| onion-architecture | Steps 5, 6 (test-writer and architecture-reviewer bodies) | Tests: "Domain/application: unit tests (`*.test.ts`) with in-memory fake ports. Infrastructure: `*.it.test.ts` with Testcontainers." Review checklist items 1–10 are the architecture-reviewer's judgment rules. |
| react-frontend-architecture | Step 6 (architecture-reviewer body) | Review checklist 1–7. "One-way imports: shared → features → app". "`'use client'` … mark the smallest file". |
| fastify-best-practices | Step 5 (test-writer body) | `rules/testing.md`: use `inject()` and close the app. Repo override: vitest, not `node:test`. |
| mermaid-diagram | Step 8 (doc-writer body); Step 9 (README workflow block) | "Don't exceed ~20 nodes", "Label edges", "Wrap in … `mermaid` code blocks", right diagram type per the Decision Guide. |

Not applicable: zod, drizzle-orm-patterns, postgresql-table-design,
next-best-practices, react-best-practices, typescript-expert, design,
pr-self-review. None of them governs a file this plan changes. Some are
referenced *inside* agent prompts; see §7.

## 6. Architecture constraints

- **Agent file convention** (from `planner.md`, `implementer.md`): YAML
  frontmatter with `name`, `description` (quoted, says *when* to delegate),
  `model`, `effort`, `maxTurns`, `tools`, `disallowedTools` (always including
  `Agent`, so no nested spawning), optional `skills`, and `hooks.PreToolUse`
  wired with `"\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/<name>.sh"`. The body
  starts with a role paragraph, then `##` sections, and ends with a fenced
  report template.
- **Hook convention** (from `planner-guard.sh`, `implementer-guard.sh`):
  `#!/bin/bash`, a header comment naming the agent and stating "wired in its
  frontmatter, so it does not affect other sessions", JSON parsing via
  `python3`, exit 2 plus a stderr message prefixed `<hook-name>:` to block,
  exit 0 to allow. New guards additionally **fail closed** (§5 security).
- **Read-only agents.** Per the subagent docs, `Bash` is not read-only by
  itself. architecture-reviewer and plan-verifier therefore get
  `disallowedTools: Write, Edit, NotebookEdit, Agent`, and every Bash call
  goes through `readonly-bash-guard.sh` (anchored allowlist).
- **Hook-per-agent scope**: hooks go in agent frontmatter, never in
  `.claude/settings.json` (existing decision in README "Permissions").
- **Do-not-touch** paths (`*/vendor/shared/**`, `client/src/vendor/ui/**`,
  `server/src/db/migrations/**`, `*/pnpm-lock.yaml`) must be blocked by
  test-writer's and doc-writer's guards as well.
- **Ownership boundaries between agents** (no two agents write the same
  artefact):
  - `docs/plans/**`: planner only.
  - `INSIGHTS.md`: implementer, test-writer (engineering-insights). doc-writer
    only *suggests* promotions.
  - `<pkg>/specs/**`: not written by any of the new agents (pre-implementation
    requirements, see §9 Q6).
  - Test files: test-writer (and implementer, when a plan step needs a test).
  - Docs (`<pkg>/docs/**`, READMEs): doc-writer. Package `AGENTS.md` "Read
    when" links are only proposed by doc-writer, never written by it
    (amended 2026-09-24, see R5).
- **Naming:** kebab-case file names, same as the existing agents and hooks.

## 7. Steps

**Step 0: Initiation.** Read root `INSIGHTS.md`, `.claude/agents/README.md`,
both existing guard hooks, and this plan in full. *Skill: engineering-insights.*

**Step 1: `.claude/hooks/readonly-bash-guard.sh` (new).** *Skill: security.*
- Usage: `readonly-bash-guard.sh <git|verify>` (the mode is passed as an
  argument in the agent frontmatter command).
- Parse `tool_name` and `tool_input.command` with `python3`. If parsing fails,
  the mode is unknown, or `tool_name != Bash`, exit 2.
- Reject (exit 2) any command containing a newline, `;`, `&`, `|`, `>`, `<`,
  a backtick, `$(`, or `${`. This keeps each call a single command, with no
  redirection or substitution.
- Mode `git`: allow only
  `^git( -C [^ ]+)? (diff|status|log|show|merge-base|rev-parse|ls-files|blame)( [^ ].*)?$`,
  and reject any `--output`, `--ext-diff` or `-o ` argument (these write files
  or run programs).
- Mode `verify`: everything `git` mode allows, plus exactly:
  - `^(npx --yes pnpm@10|pnpm) -C (server|client|e2e) (typecheck|test|lint)$`
  - `^(npx --yes pnpm@10|pnpm) -C (server|client) exec vitest run [A-Za-z0-9_./\[\]@-]+( --exclude [^ ]+)?$`
  - `^npm --prefix reviewer-core (test|run typecheck)$`
- Blocked message: `readonly-bash-guard(<mode>): '<cmd>' is not on the read-only allowlist. …`.
- Header comment explains the two modes and which agent uses each.

**Step 2: `.claude/hooks/test-writer-guard.sh` (new).** *Skill: security.*
Start from `implementer-guard.sh` and change the following:
- Fail closed on a parse error (exit 2).
- **Edit|Write:** allow only when `file_path` is under `$CLAUDE_PROJECT_DIR`
  and matches one of:
  - `/(client|server|reviewer-core)/.*\.test\.tsx?$` (this covers `.it.test.ts`)
  - `/client/src/test/[^/]+\.(ts|tsx)$` (shared client test helpers)
  - `/server/test/helpers/[^/]+\.ts$`
  - `/(client|server|reviewer-core|e2e)/INSIGHTS\.md$` or `^<root>/INSIGHTS\.md$`

  Even when one of these matches, still block the implementer's `protected`
  regex (vendor/migrations/lockfile).
- **Bash:** keep the implementer's blocks (`git commit|push`, `db:migrate`,
  shell writes into protected paths). Also block dependency changes, which
  would touch lockfiles: `(pnpm|npm|yarn)( [^ ]+)* (add|install|i|remove|rm|uninstall|update|up)( |$)`
  and `npx --yes pnpm@[^ ]+ (add|install|…)`. Block `sed -i`, `tee` and `>`/`>>`
  when the target is not a test path or the session scratchpad. If the pattern
  gets too complex, block `sed -i`/`tee`/redirection outright and tell the
  agent to use Edit/Write (see §9 R3).

**Step 3: `.claude/hooks/doc-writer-guard.sh` (new).** *Skill: security.*
- Fail closed. Only `Edit|Write`. Allow only `.md` paths under
  `$CLAUDE_PROJECT_DIR` that match:
  - `^<root>/(server|client|reviewer-core|e2e)/docs/[a-z0-9][a-z0-9-]*\.md$`
  - `^<root>/(server|client|reviewer-core|e2e)/README\.md$`
  - `^<root>/server/src/modules/[a-z0-9-]+/README\.md$`
  - `^<root>/README\.md$`
  - `^<root>/docs/(?!plans/)[a-z0-9-]+/[a-z0-9][a-z0-9-]*\.md$` (write the
    lookahead as two separate grep checks, because `grep -E` has no lookahead)
- Always block: `docs/plans/`, any `INSIGHTS.md`, `CLAUDE.md`, every
  `AGENTS.md` (root and packages; amended 2026-09-24, `CLAUDE.md` is a symlink
  to it), `*/specs/**`, `.claude/**`, and the protected regex.

**Step 4: Make hooks executable.** `chmod +x` on the three new scripts
(implementer Bash, one call per file).

**Step 5: `.claude/agents/test-writer.md` (new).**
*Skills governing the content: react-testing-library, onion-architecture,
fastify-best-practices.*

Frontmatter:
```yaml
---
name: test-writer
description: "Use after the implementer finishes, or when asked to add or extend tests, for client/ UI components and hooks and for server/ and reviewer-core/ routes, services, repositories and engine code. Picks the right test kind (RTL component test, hermetic unit test, Fastify inject route test, Testcontainers *.it.test.ts), applies the matching project skills, runs the targeted tests, and reports which regression each test catches. Writes only test files and test helpers; never changes production code, dependencies or lockfiles."
model: sonnet
effort: medium
maxTurns: 50
tools: Read, Grep, Glob, Edit, Write, Bash, Skill
disallowedTools: Agent, NotebookEdit
skills:
  - engineering-insights
  - react-testing-library
  - onion-architecture
hooks:
  PreToolUse:
    - matcher: "Bash|Edit|Write"
      hooks:
        - type: command
          command: "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/test-writer-guard.sh"
---
```
Loaded on demand via `Skill`: `fastify-best-practices` (then read
`rules/testing.md`), `drizzle-orm-patterns` (repository `.it` tests), `zod`
(contract tests), `react-best-practices`, `next-best-practices` (only when a
test touches RSC or route files).

System-prompt outline (body sections):
1. **Role**: one paragraph. You write tests only. You never edit production
   code. If a test exposes a production bug, keep the test, do not `.skip`
   it, and report it.
2. **Inputs**: a target (file/component/module), or a Development Plan
   (sections 3, 7, 8) and/or an Implementation Report ("Done", "Handoff to
   review"). If there is no target, ask with a numbered list and stop.
3. **Start**: read the `AGENTS.md` + `INSIGHTS.md` of the target package and
   `TESTING.md`. Invoke via `Skill` every on-demand skill whose area you test.
4. **Pick the test kind** (table):

   | Target | Kind | Location / name |
   |---|---|---|
   | client component in `_components/<Name>/` | RTL + jsdom flow test | `<Name>/<Name>.test.tsx` (co-located) |
   | client pure helper (`helpers.ts`, `src/lib/*.ts`) | unit | co-located `<file>.test.ts`, or inside the component test if it has only one consumer |
   | server service / domain logic | unit with in-memory fake ports | `server/test/<module>-<topic>.test.ts` |
   | server route, no DB | `buildApp({config, overrides})` + `app.inject` + `app.close()` | `server/test/<name>.test.ts` |
   | server repository / DB-backed route | Testcontainers: `dockerAvailable()`, `startPg()`, `seed()`, `describe.skip` fallback | `server/test/<name>.it.test.ts` |
   | reviewer-core engine | unit with stubbed `LLMProvider` | `reviewer-core/test/<name>.test.ts` |

   It also states that server tests live in `server/test/`, not next to the
   source (this is what the repo does, even though CLAUDE.md says
   "co-located").
5. **Repo overrides of the generic skills** (quote `client/INSIGHTS.md`
   2026-09-20):
   - `import userEvent from "@/test/user"`, the fireEvent shim. It has no
     `hover`/`keyboard`/`setup()`, so call its methods directly.
   - `renderWithIntl` from `@/test/render-intl` for components that use
     next-intl.
   - fixtures from `@/test/fixtures`; `afterEach(cleanup)`.
   - No MSW. Mock at the hook or API module (`vi.mock("@/lib/hooks/…")`) or
     pass props. Never mock the component under test.
   - vitest everywhere (never `jest`, never `node:test`).
   - Server externals come from `src/adapters/mocks.ts`. No network, no keys.
   - Never add dependencies. If a capability is missing (e.g., hover), report
     it under "Not covered".
6. **RTL rules kept** (from the skill): query priority, `screen`,
   `findBy`/`waitFor` (no fixed delays), 1–3 flow tests per component,
   behaviour not implementation, no snapshots.
7. **Coverage bar** (TESTING.md): one happy path plus the edge that matters.
   Before writing each test, state which regression it catches. Drop tests
   that catch nothing.
8. **Run**: first the targeted file (`npx --yes pnpm@10 -C client exec vitest
   run <path>` / the same with `-C server`), then the package `test` +
   `typecheck`. `.it` tests self-skip without Docker; report that as "skipped
   (no Docker)", never as passed.
9. **Record insights** (engineering-insights gate).
10. **Guardrails**: the hook-enforced paths (listed), no commit/push, no
    `db:migrate`, no installs. Do not weaken existing assertions to make a
    suite green.

Output format:
```
# Test Report
## Targets
What was asked / derived from plan or report.
## Tests written
file → test name → scenario → regression it catches (new / extended).
## Skills applied
Preloaded / invoked (with reason).
## Checks run
command → result (real output for failures; `.it` skipped = "skipped: no Docker").
## Failing: suspected production defects
test → failure output → suspected cause (file:line). "none" if none.
## Not covered
Behaviour left untested and why (missing tool/dependency, out of scope).
## INSIGHTS.md
Entries written or "none".
```

**Step 6: `.claude/agents/architecture-reviewer.md` (new).**
*Skills governing the content: onion-architecture,
react-frontend-architecture.*

Frontmatter:
```yaml
---
name: architecture-reviewer
description: "Use proactively after the implementer or test-writer finishes, or before opening a PR, to check architectural boundaries of the changed code: server onion layering (routes → service → repository, ports, no infra imports in service/ports/domain, repositories return mapped types), module isolation, client feature boundaries and the server/client ('use client') split, reviewer-core purity, and do-not-touch paths. Read-only: returns findings with file:line evidence and quoted code, plus a 'cannot verify' list; never edits files."
model: opus
effort: high
maxTurns: 30
tools: Read, Grep, Glob, Bash
disallowedTools: Write, Edit, NotebookEdit, Agent
skills:
  - onion-architecture
  - react-frontend-architecture
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/readonly-bash-guard.sh git"
---
```
It reads other skill files directly with `Read` when needed:
`.claude/skills/next-best-practices/rsc-boundaries.md`,
`.claude/skills/pr-self-review/severity.md`.

System-prompt outline:
1. **Role and scope**: architecture only. Not security, style, test quality or
   plan compliance (security review is done elsewhere; plan-verifier covers
   plan compliance). Advisory: `pr-self-review` stays the merge gate.
2. **Inputs**: the changed-file list from the Implementation Report "Handoff to
   review", or from `git status --porcelain` + `git diff --name-only <base>`
   (the working tree too, because the implementer does not commit). Optional:
   plan section 6 (Architecture constraints).
3. **Pass 1, deterministic (Grep on the working tree)**: reproduce the
   `checks.sh` section 4 rules with the same rule ids, plus the extra
   structural rules:
   - `det/layer-route-repo`: `routes.ts` imports `./repository`.
   - `det/layer-service-infra`: `service.ts`/`ports.ts`/`domain/**` imports
     `fastify|drizzle-orm|postgres|octokit|@octokit/*|openai|@anthropic-ai/sdk`.
   - `det/client-imports-server`: `client/**` imports `server/` or `@devdigest/api`.
   - `onion/service-new-infra`: `new \w+(Repository|Client|Provider)\(` or a
     `Container` import in `service.ts`.
   - `onion/raw-rows`: `$inferSelect` in a repository's public return type.
   - `onion/cross-module`: `modules/<a>/**` importing `modules/<b>/(repository|helpers|constants)`.
   - `frontend/cross-feature`: `client/src/app/<a>/**` importing
     `client/src/app/<b>/_components`.
   - `frontend/fetch-in-component`: `fetch(` in `_components/**`.
   - `frontend/server-client-boundary`: `'use client'` in `page.tsx`/`layout.tsx`.
   - `rc/impure`: `reviewer-core/src/**` imports `fs`, `node:fs`,
     `child_process`, `postgres`, `drizzle-orm`, `octokit`, or a concrete LLM
     SDK outside `src/llm/`.
   - `det/do-not-touch`: changed paths under the protected list.
4. **Pass 2, intent-level (LLM judgment)**: only on changed hunks. Apply the
   onion "Review checklist" 1–10 and the react-frontend-architecture "Review
   checklist" 1–7. Do not rewrite untouched modules (onion skill intro).
5. **Evidence rule** (anti-false-positive): every finding has `file:line`, the
   verbatim quoted line(s), the rule id, and the skill section that makes it a
   violation. Before reporting, re-open the file at that line to confirm it.
   If you cannot confirm it, move it to "Cannot verify". No generic advice.
6. **Severity**: use the `pr-self-review/severity.md` vocabulary
   (critical/major/minor) and ids. Violations that already exist in untouched
   lines go to "Pre-existing", not "Findings".
7. **Verdict** (advisory): `CLEAN` (no findings) / `CONCERNS` (major/minor
   only) / `VIOLATIONS` (≥1 critical).
8. **Guardrails**: read-only. Bash only through the git allowlist. Suggested
   direction is one sentence and never a patch.

Output format:
```
# Architecture Review
## Scope
Base, files reviewed, files skipped (vendored/generated/docs) and why.
## Verdict
CLEAN | CONCERNS | VIOLATIONS (advisory; pr-self-review is the gate).
## Findings
| # | severity | rule id | file:line | evidence (quoted) | rule source (skill §) | direction |
## Pre-existing (not introduced by this change)
Same columns.
## Cannot verify
Suspected issue → what evidence is missing.
## Checks run
Pass 1 patterns (with hit counts) and git commands.
```

**Step 7: `.claude/agents/plan-verifier.md` (new).** *No code skill. The
prompt content follows the planner output format (`planner.md:74-99`).*

Frontmatter:
```yaml
---
name: plan-verifier
description: "Use after implementation (and tests) to verify the finished code against EVERY item of a Development Plan in docs/plans/<feature>_en.md and the linked specs/requirements: first extracts a numbered requirement checklist, then audits each item as PASS / FAIL / PARTIAL / NOT VERIFIABLE / BLOCKED with file:line or command-output evidence. Never replaces plan items with generic best-practice advice. Read-only except for running the plan's own acceptance commands."
model: opus
effort: high
maxTurns: 40
tools: Read, Grep, Glob, Bash
disallowedTools: Write, Edit, NotebookEdit, Agent
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/readonly-bash-guard.sh verify"
---
```
No preloaded skills: its checklist comes from the plan, not from skills. That
is intentional, so it cannot drift into generic advice.

System-prompt outline:
1. **Role**: a traceability auditor. The plan and requirements are the only
   yardstick.
2. **Inputs**: plan path (required; if it is missing or not in the planner
   format, stop and say what is missing). Optional: spec paths named in the
   plan (`<pkg>/specs/<feature>.md`), the Implementation Report, the Test
   Report, and extra user requirements quoted in the task.
3. **Phase 1, extract (no code reading yet)**: turn every atomic item into a
   row with a stable id:
   - `P3.n`: each affected file/change (section 3)
   - `P4.n`: each contract (section 4)
   - `P6.n`: each constraint (section 6)
   - `P7.n`: each step, split per file when a step names several
   - `P8.n`: each acceptance command/check (section 8)
   - `P1.NG.n`: each non-goal (verified as *not* done)
   - `S.<spec>.n`: each spec requirement / acceptance criterion
   - `U.n`: each user requirement

   Print the count per source. Nothing may be merged or dropped. If a source
   item is ambiguous, keep it and mark it `NOT VERIFIABLE (ambiguous)`.
4. **Phase 2, audit**: for each id, find evidence (file:line + quote, `git
   diff` hunk, or command output). Allowed verdicts: `PASS`, `FAIL`,
   `PARTIAL` (state what is missing), `NOT VERIFIABLE` (state why, e.g.
   browser check with no tool, `.it` tests skipped without Docker), `BLOCKED`
   (the plan lists it as an open question). A deviation acknowledged in the
   Implementation Report still gets FAIL/PARTIAL, marked "acknowledged".
5. **Commands**: run the section 8 commands through the allowlist
   (`npx --yes pnpm@10 -C <pkg> …`, per root INSIGHTS). A command the
   allowlist refuses becomes `NOT VERIFIABLE (not allowlisted)`. Never trust
   "Checks run" from another report without re-running it or marking it
   unverified.
6. **Scope creep**: every changed file (`git status --porcelain`, `git diff
   --name-only <base>`) that no id traces to goes under "Unplanned changes".
7. **Forbidden**: generic advice, style comments, architecture/security
   opinions, and suggestions not tied to an id.
8. **Overall**: `COMPLETE` only if every item is PASS, or NOT VERIFIABLE with
   a reason the user can accept. Otherwise `INCOMPLETE`.

Output format:
```
# Plan Verification: <feature>
## Sources
Plan path, spec paths, reports used, base commit, working-tree state.
## Requirement checklist (N items: P=…, S=…, U=…)
| ID | Source (file §) | Requirement (quoted or condensed) | Verdict | Evidence |
## Failures and partials
Per id: expected, found, where it should be.
## Commands run
command → exit/result (real output for failures).
## Unplanned changes
file → why it is not traced to any id.
## Not verifiable
id → reason → what would verify it.
## Summary
Counts per verdict; overall COMPLETE | INCOMPLETE.
```

**Step 8: `.claude/agents/doc-writer.md` (new).** *Skill governing the
content: mermaid-diagram.*

Frontmatter:
```yaml
---
name: doc-writer
description: "Use after a feature is implemented and verified (plan-verifier COMPLETE), or when asked to document existing behaviour: turns a Development Plan, spec, implementation/verification report or the code itself into documentation in the right place (package docs/<topic>.md, package or module README sections, root README architecture), with Mermaid diagrams where they clarify. Proposes package AGENTS.md 'Read when' links in its report (it cannot edit AGENTS.md). Verifies claims against the code. Writes only documentation markdown; never code, plans, specs, INSIGHTS.md, AGENTS.md or CLAUDE.md."
model: sonnet
effort: medium
maxTurns: 30
tools: Read, Grep, Glob, Edit, Write
disallowedTools: Bash, NotebookEdit, Agent
skills:
  - mermaid-diagram
hooks:
  PreToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/doc-writer-guard.sh"
---
```

System-prompt outline:
1. **Role**: document what shipped, not what was planned. Code is the source
   of truth. If the plan/spec and the code differ, document the code and
   report the difference.
2. **Inputs**: a feature name plus any of: plan path, spec paths, reports,
   module paths. Read the package `AGENTS.md`, `README.md`, `docs/README.md`
   and the existing docs first, so nothing gets duplicated.
3. **Where to write** (placement table; also written in the report):

   | Content | Destination | Rule |
   |---|---|---|
   | Deep architecture note / decision for one package (explanation) | `<pkg>/docs/<topic>.md`, kebab-case, one topic per file | then propose a "Read when" link for `<pkg>/AGENTS.md` in the report (doc-writer cannot edit it) |
   | Package map changes (route map, API map, pipeline, testing) | the existing section of `<pkg>/README.md` | extend it; do not start a parallel page |
   | Internals of one server module | `server/src/modules/<name>/README.md` | precedent: `repo-intel/README.md` |
   | Cross-package flow | root `README.md#architecture` | update the existing mermaid diagram; never add a second one |
   | Reviewer agent prompts | `docs/agent-prompts/` | only when asked; follow its "Checklist before shipping a prompt" |
   | Plans / specs / INSIGHTS | not written | owned by planner / humans / engineering-insights |

4. **Doc type** (Diátaxis): declare one type per page (tutorial, how-to,
   reference, explanation) and do not mix them. Package `docs/` pages are
   mostly *explanation* or *reference*.
5. **Diagrams** (mermaid-diagram skill): choose the type with the Decision
   Guide (sequence for API flows, flowchart for pipelines, ER for tables,
   state for lifecycles). ≤20 nodes, labelled edges, fenced ```` ```mermaid ````.
   Node ids and edges must name real modules/files. There is no Bash, so
   check the syntax against the skill tables before writing, and list every
   diagram in the report for a human render check.
6. **Evidence**: each behavioural statement links a repo path
   (`path/to/file.ts`), optionally with a line number. Nothing is copied from
   the plan without checking it against code.
7. **Style**: English, matching the existing docs. Hard-wrapped around 80
   columns like the existing markdown. No new visual assets.
8. **INSIGHTS promotion**: list stable INSIGHTS entries that belong in the
   new doc under "Suggested INSIGHTS promotions". Do not edit INSIGHTS.md.
9. **Guardrails**: the hook-enforced path allowlist (listed). No Bash.

Output format:
```
# Documentation Report
## Sources used
Plan/spec/report/code paths actually read.
## Files written
path → new/modified → Diátaxis type → sections touched.
## Diagrams
path → mermaid type → what it shows → nodes count.
## Proposed AGENTS.md links
## Discrepancies (plan/spec vs code)
item → plan says → code does (file:line).
## Not documented
What and why.
## Suggested INSIGHTS promotions
entry (file + date) → target doc.
```

**Step 9: `.claude/agents/README.md` (modified).** *Skill: mermaid-diagram
(only if the workflow block is converted; the default is to keep the
existing ASCII style).*
- Overview table: add 4 rows (model / effort / maxTurns, tools, denied), in
  the existing column format.
- Workflow block: replace it with the pipeline from §1, and keep
  "researcher ── standalone".
- Replace the sentence "Architecture and security review are **not** done by
  these agents" with: architecture review is done by `architecture-reviewer`
  (advisory; `pr-self-review` remains the gate), and security review is still
  done outside these agents.
- Per-agent card for each new agent: Inputs, Output, Preloaded skills,
  Permissions (hook name + what it blocks).
- "Sources behind the rules": one table per new agent. Repo sources
  (CLAUDE.md, TESTING.md, INSIGHTS entries, skills, severity.md) plus
  **external sources** (URLs listed in §9 "External sources"). Mark the
  quotes taken from search summaries as "summary, to be verified".
- The "Adding an agent" section stays unchanged.

**Step 10: Hook self-tests (manual, no files created).** Run the §8 hook
commands and paste the exit codes into the implementation report.

**Step 11: Smoke runs** (user-triggered, on a throwaway branch; see §8).

**Step 12: Record insights.** Root `INSIGHTS.md`, only if something
non-obvious happened. The known candidate is "`implementer-guard.sh` fails
open on parse errors; the new guards fail closed". Put it under Codebase
Patterns, and dedupe first. *Skill: engineering-insights.*

## 8. Acceptance checks

No package source changes, so `pnpm typecheck` / `pnpm test` are **not
required** by this task. Run them only if a smoke run changes package files
(test-writer smoke): `npx --yes pnpm@10 -C client test` and
`npx --yes pnpm@10 -C client typecheck`.

Static checks (repo root):
- `ls .claude/agents/` lists `architecture-reviewer.md doc-writer.md
  implementer.md plan-verifier.md planner.md researcher.md test-writer.md`
  plus `README.md`.
- Frontmatter parses:
  `python3 -c 'import sys,re,yaml; [yaml.safe_load(re.match(r"^---\n(.*?)\n---", open(f).read(), re.S).group(1)) for f in sys.argv[1:]]' .claude/agents/*.md`
  exits 0. If PyYAML is missing, confirm in `/agents` that all four agents
  load without errors.
- `test -x .claude/hooks/readonly-bash-guard.sh && test -x .claude/hooks/test-writer-guard.sh && test -x .claude/hooks/doc-writer-guard.sh`

Hook tests (expected exit code in brackets; `R=/Users/mtakumi/Projects/dev-digest`,
run with `CLAUDE_PROJECT_DIR=$R`):
- readonly `git`: `{"tool_name":"Bash","tool_input":{"command":"git diff --name-only main"}}` [0];
  `git diff --output=/tmp/x` [2]; `git status; rm -rf x` [2];
  `git log | head` [2]; `pnpm -C client test` [2]; malformed JSON `{` [2].
- readonly `verify`: `npx --yes pnpm@10 -C client test` [0];
  `npm --prefix reviewer-core test` [0];
  `npx --yes pnpm@10 -C client add msw` [2]; `cd client && pnpm test` [2].
- test-writer: Write `$R/client/src/app/skills/_components/SkillsList/SkillsList.test.tsx` [0];
  Write `$R/client/src/app/skills/_components/SkillsList/SkillsList.tsx` [2];
  Write `$R/server/test/foo.it.test.ts` [0];
  Write `$R/client/src/vendor/ui/x.test.tsx` [2];
  Bash `git commit -m x` [2]; Bash `npx --yes pnpm@10 -C client add msw` [2];
  Bash `echo x > $R/server/src/app.ts` [2]; malformed JSON [2].
- doc-writer: Write `$R/server/docs/grounding-gate.md` [0];
  Write `$R/server/AGENTS.md` [2]; Write `$R/docs/plans/x_en.md` [2];
  Write `$R/server/INSIGHTS.md` [2]; Write `$R/server/specs/x.md` [2];
  Write `$R/server/src/app.ts` [2]; Write `$R/CLAUDE.md` [2]; malformed JSON [2].

Behavioural smoke runs (user-triggered, throwaway branch; each is its own
check):
- **test-writer**: "Add a test for the empty state of
  `client/src/app/repos/[repoId]/pulls/[number]/_components/VerdictBanner`."
  Expect a Test Report in the template, `git status --porcelain` showing only
  `*.test.tsx` changes, `import userEvent from "@/test/user"` (if interaction
  is needed), and `getByRole`/`getByText` queries.
- **architecture-reviewer**: on a scratch branch, add
  `import { SkillsRepository } from './repository'` to
  `server/src/modules/skills/routes.ts` (uncommitted). Expect one critical
  `det/layer-route-repo` finding with the exact `file:line` and quoted import,
  no file changes by the agent, and a "Cannot verify" section present (even if
  "none").
- **plan-verifier**: run against `docs/plans/quality-subagents_en.md` itself
  after this plan is implemented. Expect a checklist whose row count equals
  the extracted §3/§4/§6/§7/§8/non-goal items, every row with a verdict and
  evidence, and "Unplanned changes" listing nothing unexpected.
- **doc-writer**: "Document the guard hooks of the agents" (or a small real
  feature). Expect writes only in allowed paths, a mermaid block ≤20 nodes
  that renders in GitHub preview or on mermaid.live, and a filled
  "Discrepancies" section (or "none").
- `.claude/agents/README.md` renders, has 7 rows in the overview table, and
  every link resolves.

## 9. Risks & open questions

**Open questions for the user.** Steps they block are noted. Defaults are in
brackets; the plan uses them unless told otherwise.
1. **Models.** [test-writer `sonnet`/medium, doc-writer `sonnet`/medium,
   architecture-reviewer `opus`/high, plan-verifier `opus`/high.] Reviewers
   and verifiers do judgment-heavy, precision-critical work. Use sonnet for
   them to cut cost? (Steps 6–7, frontmatter only.)
2. **Bash for read-only agents.** [Bash plus the `readonly-bash-guard.sh`
   allowlist.] The alternative is no Bash at all (`tools: Read, Grep, Glob`).
   Then architecture-reviewer needs the changed-file list passed in, and
   plan-verifier can no longer re-run acceptance commands; they become NOT
   VERIFIABLE. (Blocks Steps 1, 6, 7 if the answer is "no Bash".)
3. **plan-verifier running tests.** [Allowed: typecheck/test/lint only.]
   Tests have side effects (Testcontainers, `.next`, caches). OK?
4. **Browser checks** in plan-verifier. [NOT VERIFIABLE unless the user
   provides a screenshot.] Should it get a Playwright MCP tool?
5. **Deterministic architecture tooling.** Add a `.dependency-cruiser.cjs`
   rule set (dependency-cruiser is already a server dependency) as a
   follow-up, so the reviewer's Pass 1 becomes a real tool run? [Out of scope
   now.]
6. **doc-writer and `specs/`.** Should it ever update `<pkg>/specs/` after
   implementation (e.g., mark "implemented")? [No.]
7. **e2e flows.** Should test-writer also author `e2e` flow JSON? [No.] Note:
   `e2e/AGENTS.md` says flows live in `specs_old/`, but `e2e/specs/` also
   contains the same `*.flow.json` files. Resolve this before any e2e agent
   work.
8. **Server test location.** CLAUDE.md says "co-located", but every server
   test is in `server/test/`. [test-writer follows `server/test/`.] Confirm,
   or fix CLAUDE.md wording (not in this plan).
9. **Documentation language.** English only, or also `_uk` like plans? [English only.]
10. **Where plan-verifier reports go.** Reply only (like the reviewers), or
    saved to `docs/plans/<feature>_verification.md`? [Reply only; saving
    would need a write-guard like the planner's.]
11. **Root `docs/` for cross-package docs.** Root `docs/` currently has only
    `agent-prompts/` and `plans/`. May doc-writer create a new root
    `docs/<topic>/` section? [Allowed by the guard regex; creating a *new*
    section needs a user OK.]

**Risks.**
- **R1: false positives in architecture review.** LLM smell/architecture
  detection has high false-positive rates (SmellBench reports 63.1%, from a
  search summary, to be verified). Mitigation: deterministic Pass 1, mandatory
  quoted evidence with re-read, a "Cannot verify" bucket, an advisory verdict.
- **R2: allowlist bypass.** Shell parsing by regex is fragile. The
  metacharacter rejection plus anchored patterns is the defence. The security
  reviewer should try: `git -c core.pager=… log`, `git diff --ext-diff`,
  `git -c alias.x='!sh' x`, `GIT_EXTERNAL_DIFF`, environment prefixes
  (`FOO=1 git …`), `pnpm -C client test -- --reporter=…`, and paths with
  spaces. Consider also rejecting `-c` in git mode.
- **R3: test-writer shell writes.** Detecting `sed -i`/`tee`/redirect targets
  by regex is best-effort. The simplest safe rule is to block them entirely
  (the agent has Edit/Write).
- **R4: `skills` preload cost.** Preloading injects the full SKILL.md. The
  preload lists are kept minimal, and the rest is loaded on demand.
- **R5: AGENTS.md and CLAUDE.md are symlinked** (confirmed 2026-09-24:
  `CLAUDE.md -> AGENTS.md` in the root and in every package). Letting
  doc-writer edit `<pkg>/AGENTS.md` would also edit `<pkg>/CLAUDE.md`, which
  is agent instructions. **Resolved 2026-09-24 (user-approved):** doc-writer
  may not touch any AGENTS.md or CLAUDE.md; it only *proposes* "Read when"
  links in its report, and the guard blocks both names everywhere.
- **R6: implementer scope.** `implementer.md` describes its scope as
  "client/ and server/". This plan touches only `.claude/`. The implementer
  guard does not block `.claude/`, but the user may prefer to apply this plan
  directly.
- **R7: pr-self-review routing.** `.claude/**` is "Not reviewed by skills",
  so the new hooks get no automated review. They need a manual security
  review.

**For the architecture / security reviewers to scrutinise.** R2, R3, R5, the
fail-closed behaviour of all three hooks, and whether `disallowedTools`
combined with the hooks really leaves architecture-reviewer and plan-verifier
with no write path.

**External sources** (accessed 2026-09-24; several points come from search
summaries, so verify the quotes before citing them in README):
- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
  (frontmatter fields; only `name` + `description` are required; `tools`
  allowlist vs `disallowedTools`; omitted `tools` inherits all; `skills`
  preloads full content and is not inherited from the parent; description
  says when to delegate; subagent sees only its own prompt plus env details).
- LLM architecture/smell review, false positives: https://arxiv.org/html/2605.07001
  (SmellBench, 63.1% FP, to be verified), https://arxiv.org/pdf/2603.00822,
  https://www.augmentcode.com/guides/ai-vulnerability-detection
- Deterministic architecture rules: https://github.com/LukasNiessen/ArchUnitTS,
  https://www.archunit.org/userguide/html/000_Index.html (and dependency-cruiser,
  already in `server/package.json`).
- Plan/requirement traceability and two-step extract-then-audit:
  https://arxiv.org/pdf/2605.17926, https://arxiv.org/pdf/2607.18886. The
  verdict schema in Step 7 is inferred, not a standard.
- Test writing: https://testing-library.com/docs/queries/about/#priority,
  https://kentcdodds.com/blog/common-mistakes-with-react-testing-library,
  https://fastify.dev/docs/latest/Guides/Testing/,
  https://node.testcontainers.org/modules/postgresql/. The unit-vs-integration
  table in Step 5 is a synthesis of these plus TESTING.md.
- Docs: https://diataxis.fr/,
  https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams

## 10. Could not determine

- **Whether `AGENTS.md` and `CLAUDE.md` are symlinks.** The contents are
  identical, but without Bash I could not check `ls -l`. This matters for R5.
- **Exact subagent frontmatter semantics.** The research summary lists
  `permissionMode`, `memory`, `isolation`, `color`. I did not fetch the docs
  myself, so it is unverified whether hook arguments (`… guard.sh git`) are
  passed through as written, and whether `disallowedTools` wins over `tools`
  when both list a tool. The existing agents use the same patterns, which
  suggests they work, but argument-passing is new. Fallback: two separate
  scripts (`readonly-git-guard.sh`, `verify-guard.sh`).
- **Authoritative Anthropic guidance for test-writer / doc-writer prompt
  design.** None was found (per the research brief). Those prompts follow repo
  conventions and the general sources above.
- **Vitest / Testcontainers reuse tips** (container reuse across files,
  `singleFork`) were not fetched. test-writer follows the existing
  `startPg()`-per-file pattern.
- **Whether PyYAML is installed** for the frontmatter check in §8. The `/agents`
  fallback is given.
- **Whether `npx --yes pnpm@10 -C <dir> exec vitest run <file>` works on this
  machine** (`-C` together with `exec`). Root INSIGHTS only confirms
  `npx --yes pnpm@10 <cmd>` in general. If it fails, plan-verifier reports the
  item NOT VERIFIABLE and test-writer falls back to the package `test` script.
- **Whether the `e2e/specs/*.flow.json` files are live or stale copies**
  (they duplicate `specs_old/`). Not needed for this plan, but it matters for
  Q7.
