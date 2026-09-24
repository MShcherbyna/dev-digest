# Agents

Project subagents for DevDigest. This file is a map — the rules themselves
live in each agent's own `.md` file; don't copy them here.

## Overview

| Agent | Responsibility | Model / effort / maxTurns | Tools | Denied |
|---|---|---|---|---|
| [planner](planner.md) | Turns a task into a structured Development Plan; saves it as `docs/plans/<feature>_en.md` + `docs/plans/<feature>_uk.md` | opus / high / 30 | Read, Grep, Glob, Write (guarded) | Agent, Edit, Bash |
| [implementer](implementer.md) | Executes an approved plan in `client/` and `server/`, verifies its own changes, records INSIGHTS | sonnet / medium / 60 | Read, Grep, Glob, Edit, Write, Bash, Skill | Agent |
| [researcher](researcher.md) | Read-only research of the repo or external sources; reports findings with evidence | sonnet / default / default | all except Write, Edit | Write, Edit |

## Workflow

```
task ──► planner ──► Development Plan ──► implementer ──► Implementation Report ──► (architecture / security review, user commit)
                                            ▲
researcher ── standalone: answers questions, feeds the user or planner input
```

Architecture and security review are **not** done by these agents; the
planner flags what to scrutinise, the implementer lists it under
"Handoff to review".

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

## Sources behind the rules

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
