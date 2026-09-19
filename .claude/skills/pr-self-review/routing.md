# Routing: changed path → skills

First matching **row group** applies; a file may match several rows (skills are unioned).
Paths are relative to the repo root. "Test" = `*.test.ts(x)` / `*.it.test.ts`.

| Changed path | Skills to run |
|---|---|
| `client/src/**/*.{ts,tsx}` (not test, not `vendor/**`) | `react-frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert` |
| `client/**/*.test.{ts,tsx}` | `react-testing-library` |
| `server/src/modules/**`, `server/src/platform/**`, `server/src/adapters/**`, `server/src/jobs/**` (not test, not `vendor/**`) | `onion-architecture`, `fastify-best-practices`, `typescript-expert` |
| `server/src/db/schema.ts`, `server/src/db/schema/**`, `server/src/modules/**/repository.ts` | `drizzle-orm-patterns`, `postgresql-table-design` |
| `server/**/*.test.ts`, `server/**/*.it.test.ts` | `typescript-expert` (tests: unit vs `.it.` naming per CLAUDE.md) |
| `reviewer-core/src/**` | `typescript-expert`, `zod` |
| `e2e/**` | `typescript-expert` |

## Cross-cutting (chosen by content, not only path)

| Trigger in the changed hunks | Skill |
|---|---|
| `from 'zod'` / `from "zod"`, `z.object`, `safeParse` | `zod` |
| routes/handlers, auth, tokens/secrets, `child_process`, `fs` writes with user input, raw SQL, LLM prompt built from untrusted text | `security` |

## Layer separation (hard rule)

- UI skills (`react-*`, `next-best-practices`, `react-testing-library`) run **only** on `client/**`.
- Backend skills (`onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`,
  `postgresql-table-design`) run **only** on `server/**`.
- `zod`, `typescript-expert`, `security` may run on any package.

## Not reviewed by skills

- `*.md`, `docs/**`, `.claude/**`, config files (`*.json`, `*.yaml`): no skill review.
- **Vendored / generated** (`*/vendor/shared/**`, `client/src/vendor/ui/**`, `server/src/db/migrations/**`,
  `*/pnpm-lock.yaml`): not reviewed, but `checks.sh` flags hand edits (see `det/do-not-touch` and `det/vendor-drift` in severity.md).
  `pnpm-workspace.yaml` and other non-lock files are not in this list.

## New skills

If `.claude/skills/README.md` lists a skill absent from this file, report
`warning: skill <name> has no routing entry` in the report instead of skipping it. Add a row here to fix it.
