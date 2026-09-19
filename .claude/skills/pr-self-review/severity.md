# Severity

`critical` blocks the PR. Precedence when assigning severity to a finding:

1. **Deterministic checks** use the table below (fixed).
2. **The skill's own severity tags win** for skills that define them (section 2 below). A rule the skill
   tags CRITICAL is `critical` here. The reviewer must cite the tag in the finding's `basis` field.
3. **Skills with no tags** (`onion-architecture`, `react-frontend-architecture`, `fastify-best-practices`,
   `next-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `typescript-expert`,
   `react-testing-library`) use section 3.
4. Truly ambiguous case: `major`, not `critical`.

`finalize.py` downgrades a **review** finding to `major` when it claims `critical` without a `basis`, and warns.

## 1. Deterministic (`checks.sh`)

| Rule id | Severity | Meaning |
|---|---|---|
| `det/typecheck` | critical | `pnpm typecheck` fails in a touched package |
| `det/tests` | critical | `pnpm test` fails in a touched package |
| `det/do-not-touch` | critical | `client/src/vendor/ui/**` edited; an existing migration/snapshot modified or removed; a `pnpm-lock.yaml` changed while its `package.json` did not. (Migration added without a schema change: major.) |
| `det/schema-no-migration` | critical | `server/src/db/schema*` changed but no new file in `server/src/db/migrations/` |
| `det/vendor-drift` | critical | branch edits `vendor/shared` and the server/client copies now differ (drift already on main is ignored) |
| `det/layer-route-repo` | critical | `routes.ts` imports `repository` directly |
| `det/layer-service-infra` | critical | `service.ts`/`ports.ts`/`domain/` imports `fastify`, `drizzle-orm`, `postgres`, `octokit`, `openai`, `@anthropic-ai/sdk` |
| `det/client-imports-server` | critical | file under `client/` imports from `server/` |
| `det/lint`, `det/no-test`, `det/skipped` | major | lint failure, changed source without co-located test, package not installed |
| `det/pr-size` | minor | more than ~40 files |

## 2. Skills that define their own severity (inherit it)

| Skill | Its tag → severity here | Where in the skill |
|---|---|---|
| `react-best-practices` | CRITICAL → **critical**, HIGH → major, MEDIUM → minor | each `## Section (LEVEL)` heading, plus "Severity Levels" |
| `zod` | CRITICAL (Schema Definition `schema-`, Parsing & Validation `parse-`) → **critical**; HIGH → major; MEDIUM-HIGH → major; MEDIUM and LOW → minor | "Rule Categories by Priority" table |
| `security` | CRITICAL → **critical**, **HIGH → critical** (exploitable with conditions, so it also blocks), MEDIUM → major, LOW → minor | "Severity Classification" table |

`basis` example: `"react-best-practices: Derive, Don't Store (CRITICAL)"`.

`react-best-practices` CRITICAL sections today: Component Design, Derive Don't Store, Render Factories,
Over-Engineering, Key Prop Patterns. Read the skill for the current list; do not rely on this one.

## 3. Skills without tags (this table is authoritative)

| Rule id | Severity | Meaning | Skill |
|---|---|---|---|
| `onion/raw-rows` | critical | repository returns Drizzle `$inferSelect` rows or SDK types across the layer boundary | onion-architecture |
| `onion/service-new-infra` | critical | service instantiates a repository/adapter or takes the whole `Container` | onion-architecture |
| `onion/*` (other checklist items) | major | other "Review checklist" / "Do not" violations | onion-architecture |
| `next/server-leak` | critical | server-only code or env secret reachable from a `'use client'` module | next-best-practices |
| `ts/contract-break` | critical | `any`/`as` that silences a mismatch with a `@devdigest/shared` contract | typescript-expert |
| `fastify/no-schema` | major | route without Zod `params`/`body` schema | fastify-best-practices |
| `frontend/*` | major | misplaced constants/helpers/hooks, unsplit components, "Review checklist" items | react-frontend-architecture |
| `frontend/server-client-boundary` | critical | boundary rule from section 6 of the skill broken so server code ships to the client | react-frontend-architecture |
| `drizzle/*`, `pg/*` | major | missing explicit snake_case column name, missing index/constraint | drizzle-orm-patterns, postgresql-table-design |
| `rtl/*` | minor | testing anti-patterns | react-testing-library |
| naming/style/barrel files | minor | CLAUDE.md naming, barrel hygiene, polish | any |

## Rule ids

Review findings use `<skill-short>/<slug>` (e.g. `react/derived-state-effect`). Reuse the ids above whenever
one applies so waivers stay stable.
