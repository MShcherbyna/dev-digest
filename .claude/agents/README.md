# Agents

Project subagents for DevDigest. This file is a map — the rules themselves
live in each agent's own `.md` file; don't copy them here.

## Overview

| Agent | Responsibility | Model / effort / maxTurns | Tools | Denied |
|---|---|---|---|---|
| [planner](planner.md) | Turns a task into a structured Development Plan; saves it as `docs/plans/<feature>_en.md` + `docs/plans/<feature>_uk.md` | opus / high / 30 | Read, Grep, Glob, Write (guarded) | Agent, Edit, Bash |
| [implementer](implementer.md) | Executes an approved plan in `client/` and `server/`, verifies its own changes, records INSIGHTS | sonnet / medium / 60 | Read, Grep, Glob, Edit, Write, Bash, Skill | Agent |
| [researcher](researcher.md) | Read-only research of the repo or external sources; reports findings with evidence | sonnet / default / default | all except Write, Edit | Write, Edit |
| [test-writer](test-writer.md) | Writes UI and backend tests with the matching project skills; reports which regression each test catches | sonnet / medium / 50 | Read, Grep, Glob, Edit, Write, Bash, Skill | Agent, NotebookEdit |
| [architecture-reviewer](architecture-reviewer.md) | Read-only check of architectural boundaries; findings with `file:line` evidence and a "cannot verify" list | opus / high / 30 | Read, Grep, Glob, Bash (guarded) | Write, Edit, NotebookEdit, Agent |
| [plan-verifier](plan-verifier.md) | Audits finished code against every plan/spec/requirement item (PASS / FAIL / PARTIAL / NOT VERIFIABLE / BLOCKED) | opus / high / 40 | Read, Grep, Glob, Bash (guarded) | Write, Edit, NotebookEdit, Agent |
| [doc-writer](doc-writer.md) | Turns plans, reports or code into docs with Mermaid diagrams, placed in the right `docs/` / README section | sonnet / medium / 30 | Read, Grep, Glob, Edit, Write (guarded) | Bash, NotebookEdit, Agent |

## Workflow

```
task ─► planner ─► plan ─► implementer ─► test-writer ─► architecture-reviewer ─┐
                                                        plan-verifier ◄─────────┘
                                                             │ COMPLETE
                                                             ▼
                                                         doc-writer
researcher ── standalone: answers questions, feeds the user or planner input
```

Architecture review is done by architecture-reviewer, but its verdict is
advisory: the `pr-self-review` skill remains the gate. Security review is
still **not** done by these agents; the planner flags what to scrutinise, the
implementer lists it under "Handoff to review".

## Per-agent card

### planner
- **Inputs:** the task; root `CLAUDE.md`; `AGENTS.md` and `INSIGHTS.md` of each touched package; the code itself.
- **Output:** a 10-section *Development Plan* (goal, context read, affected modules, contracts, skills for implementer, architecture constraints, steps, acceptance checks, risks/open questions, could-not-determine). Ambiguous tasks return only questions.
- **Preloaded skills:** engineering-insights, onion-architecture, react-frontend-architecture, fastify-best-practices, drizzle-orm-patterns, postgresql-table-design.
- **Also writes:** the plan as two files in `docs/plans/` — `<feature>_en.md` (English) and `<feature>_uk.md` (Ukrainian).
- **Permissions:** Write is allowed only for those two paths, enforced by a `PreToolUse` hook ([../hooks/planner-guard.sh](../hooks/planner-guard.sh)) wired in the agent's frontmatter. Cannot edit files, spawn agents or run commands.

### implementer
- **Inputs:** a plan in the planner format (needs sections 5, 7, 8 — otherwise it stops); `AGENTS.md` / `INSIGHTS.md` of touched packages.
- **Output:** an *Implementation Report* (done, skills applied, checks run, deviations, not verified, INSIGHTS.md entries, handoff to review); changed source/test files; possibly `INSIGHTS.md` entries.
- **Preloaded skills:** engineering-insights, typescript-expert, zod, onion-architecture, react-frontend-architecture (plus whatever plan section 5 lists).
- **Permissions:** can edit and run Bash, but a `PreToolUse` hook ([../hooks/implementer-guard.sh](../hooks/implementer-guard.sh)) blocks edits to do-not-touch paths, `git commit`/`push`, and `db:migrate`. The hook is wired in the agent's frontmatter, so it applies to this agent only. It cannot spawn agents.

### researcher
- **Inputs:** a concrete research question. If the question or scope is vague, it first runs *interview mode* (asks numbered questions, does no searching).
- **Output:** a report — repo mode: Findings / Evidence (`file:line`) / Sources / Could not determine; external mode: Findings / Evidence / Sources (URL + date) / Could not find. Both modes → two labelled reports.
- **Permissions:** no Write/Edit; never invokes `/deep-research`. Has no skills or hooks configured.

### test-writer
- **Inputs:** a target, or plan sections 3, 7, 8, or the Implementation Report. With no target it asks numbered questions and stops.
- **Output:** a *Test Report* (targets, tests written with the regression each catches, checks run, suspected production defects, not covered).
- **Preloaded skills:** engineering-insights, react-testing-library, onion-architecture, fastify-best-practices, drizzle-orm-patterns, zod (react-best-practices and next-best-practices on demand).
- **Permissions:** [../hooks/test-writer-guard.sh](../hooks/test-writer-guard.sh) allows edits only to test files, test helpers and `INSIGHTS.md`, blocks commit/push/migrate/dependency changes and shell writes. Fails closed on unparsable input.

### architecture-reviewer
- **Inputs:** the "Handoff to review" file list, or the uncommitted diff.
- **Output:** an *Architecture Review* (verdict CLEAN / CONCERNS / VIOLATIONS, findings table with rule id, `file:line`, quoted evidence, pre-existing issues, cannot verify).
- **Preloaded skills:** onion-architecture, react-frontend-architecture.
- **Permissions:** no Write/Edit; Bash only through [../hooks/readonly-bash-guard.sh](../hooks/readonly-bash-guard.sh) in `git` mode (read-only git commands).

### plan-verifier
- **Inputs:** a plan path (required), optionally specs and quoted requirements.
- **Output:** a *Plan Verification* report: a numbered requirement checklist, a verdict with evidence per item, commands run, unplanned changes.
- **Preloaded skills:** none, on purpose, so it cannot drift into generic advice.
- **Permissions:** no Write/Edit; Bash only through `readonly-bash-guard.sh` in `verify` mode (read-only git plus typecheck/test/lint and targeted vitest runs).

### doc-writer
- **Inputs:** a plan, spec, report or the code itself; existing docs of the touched package.
- **Output:** a *Documentation Report* (files written, diagrams, proposed AGENTS.md links, plan-vs-code discrepancies, not documented).
- **Preloaded skills:** mermaid-diagram.
- **Permissions:** [../hooks/doc-writer-guard.sh](../hooks/doc-writer-guard.sh) allows only documentation `.md` paths. It cannot edit `AGENTS.md` (`CLAUDE.md` is a symlink to it), so it only **proposes** "Read when" links.

## Sources behind the rules

Design plan for the four agents below: [docs/plans/quality-subagents_en.md](../../docs/plans/quality-subagents_en.md). Sources marked † came from search summaries and are to be verified at the source. Frontmatter fields and read-only tool rules for all four: [Claude Code subagents](https://code.claude.com/docs/en/sub-agents).

### test-writer
| Rule area | Source |
|---|---|
| Test naming/location, do-not-touch paths, validation before "done" | [/CLAUDE.md](../../CLAUDE.md) (Naming conventions, Do-not-touch, Validation) |
| Test strategy, `.it.test.ts` for DB-backed tests, mocks in `src/adapters/mocks.ts` | [/TESTING.md](../../TESTING.md) |
| Repo exceptions to the generic skills (no `user-event`/MSW, `@/test/user` shim, `renderWithIntl`) | [client/INSIGHTS.md](../../client/INSIGHTS.md) 2026-09-20; [server/INSIGHTS.md](../../server/INSIGHTS.md); [/INSIGHTS.md](../../INSIGHTS.md) (`npx --yes pnpm@10`) |
| RTL rules, unit-vs-integration split, Fastify `inject` | skills: [react-testing-library](../skills/react-testing-library/SKILL.md), [onion-architecture](../skills/onion-architecture/SKILL.md), [fastify-best-practices](../skills/fastify-best-practices/SKILL.md) |
| RTL query priority, userEvent, async | [Testing Library](https://testing-library.com/docs/queries/about/#priority), [Kent C. Dodds](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library) |
| Fastify `inject`, Testcontainers Postgres (the split is a synthesis) | [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/), [Testcontainers](https://node.testcontainers.org/modules/postgresql/) |

### architecture-reviewer
| Rule area | Source |
|---|---|
| Layering, ports/adapters, review checklists | skills: [onion-architecture](../skills/onion-architecture/SKILL.md), [react-frontend-architecture](../skills/react-frontend-architecture/SKILL.md) |
| Rule ids and severities (reused so waivers stay stable) | [pr-self-review/severity.md](../skills/pr-self-review/severity.md), [checks.sh](../skills/pr-self-review/checks.sh) |
| Do-not-touch paths | [/CLAUDE.md](../../CLAUDE.md) "Do-not-touch" |
| Deterministic checks first, evidence required, warnings over blocks † | [SmellBench](https://arxiv.org/html/2605.07001), [ContextCov](https://arxiv.org/pdf/2603.00822), [Augment Code guide](https://www.augmentcode.com/guides/ai-vulnerability-detection), [ArchUnitTS](https://github.com/LukasNiessen/ArchUnitTS), [ArchUnit](https://www.archunit.org/userguide/html/000_Index.html) |

### plan-verifier
| Rule area | Source |
|---|---|
| Plan format it audits (sections 3, 4, 6, 7, 8) | [planner.md](planner.md) output format; `docs/plans/<feature>_en.md` |
| Acceptance commands it may re-run | [/CLAUDE.md](../../CLAUDE.md) "Validation"; [/TESTING.md](../../TESTING.md); [/INSIGHTS.md](../../INSIGHTS.md) (`npx --yes pnpm@10`) |
| Per-item requirement traceability † (verdict schema is inferred, not standard) | [LLM static verification](https://arxiv.org/pdf/2605.17926), [TraceDev](https://arxiv.org/pdf/2607.18886) |

### doc-writer
| Rule area | Source |
|---|---|
| Where docs go, "one file per topic", link from AGENTS.md | `<pkg>/docs/README.md`, `<pkg>/AGENTS.md`; [/CLAUDE.md](../../CLAUDE.md) "Read when" |
| Root architecture diagram is not duplicated | [/README.md](../../README.md#architecture); CLAUDE.md "Read when" |
| Promote stable INSIGHTS into docs (suggest only) | [engineering-insights](../skills/engineering-insights/SKILL.md) |
| Why AGENTS.md is proposed, not edited | `CLAUDE.md` is a symlink to `AGENTS.md`; [/INSIGHTS.md](../../INSIGHTS.md) 2026-09-24 |
| Diagram syntax and limits | skill: [mermaid-diagram](../skills/mermaid-diagram/SKILL.md) |
| Doc types, Mermaid in Markdown | [Diátaxis](https://diataxis.fr/), [GitHub diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams) |

### planner
| Rule area | Source |
|---|---|
| Read order, do-not-touch list, naming, validation commands, design policy | [/CLAUDE.md](../../CLAUDE.md) (Development workflow: Initiation → Planning) |
| Per-package structure and conventions | `<package>/AGENTS.md` |
| Prior gotchas and decisions | `<package>/INSIGHTS.md`, [/INSIGHTS.md](../../INSIGHTS.md); [engineering-insights](../skills/engineering-insights/SKILL.md) |
| Area → skill routing table | [skills/README.md](../skills/README.md) catalog and each `skills/<name>/SKILL.md` |
| Layering (`routes → service → repository`), ports/adapters | [onion-architecture](../skills/onion-architecture/SKILL.md) |
| Component/folder placement | [react-frontend-architecture](../skills/react-frontend-architecture/SKILL.md) |
| Migrations only via `pnpm db:generate` | CLAUDE.md "Do-not-touch"; [drizzle-orm-patterns](../skills/drizzle-orm-patterns/SKILL.md) |
| Screenshots as UI source of truth | CLAUDE.md "Design policy"; [design](../skills/design/SKILL.md) |

### implementer
| Rule area | Source |
|---|---|
| Plan-first, package conventions, five-phase workflow (Implementation → Validation → Completion) | [/CLAUDE.md](../../CLAUDE.md) |
| Plan format it consumes (sections 5, 7, 8) | [planner.md](planner.md) output format |
| Do-not-touch paths, no commit/push, no `db:migrate` | CLAUDE.md "Do-not-touch", "GIT" and `server/` migration note; enforced by [implementer-guard.sh](../hooks/implementer-guard.sh) |
| Verify with `pnpm typecheck` + `pnpm test`, no success on typecheck alone | CLAUDE.md "Validation"; [/TESTING.md](../../TESTING.md) |
| INSIGHTS recording (section, specificity bar, duplicate check) | [engineering-insights](../skills/engineering-insights/SKILL.md) |
| Code conventions while implementing | skills: [typescript-expert](../skills/typescript-expert/SKILL.md), [zod](../skills/zod/SKILL.md), [onion-architecture](../skills/onion-architecture/SKILL.md), [react-frontend-architecture](../skills/react-frontend-architecture/SKILL.md) |
| Commit prefix / branch naming (why the agent leaves commits to the user) | CLAUDE.md "GIT" |

## Adding an agent

Add `<name>.md` with frontmatter (`name`, `description`, `model`, `tools` /
`disallowedTools`, optional `skills`, `hooks`), then add a row and a card
here. Keep the README to a summary and link out for the details.
