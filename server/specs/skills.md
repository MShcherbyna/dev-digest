# Skills (server)

Reusable, **text-only** instruction blocks shared across review agents. A skill
is configuration, never executable: nothing in a skill (or an imported file)
is run, fetched or evaluated — its body is only ever inserted into a prompt.

## Data
- `skills` (existing): workspace-scoped; `name`, `description`, `type`
  (`rubric|convention|security|custom`), `source`
  (`manual|imported_url|extracted|community`), `body`, `enabled` (GLOBAL master
  switch), `version`.
- `skill_versions` (existing): one row per body version. `PUT /skills/:id`
  that changes `body` (or any field) bumps `skills.version` and inserts the new
  body row.
- `agent_skills` (existing + **new** `enabled boolean default true`): per-agent
  binding with `order`. A skill reaches an agent's prompt iff
  `skills.enabled AND agent_skills.enabled`, in ascending `order`.

## API (module `src/modules/skills/`: routes → service → repository)
| Route | Notes |
|---|---|
| `GET /skills` | `SkillSummary[]` (`tokens`, `agents_count`, `pull_pct`, `accept_pct`) |
| `POST /skills` | `SkillCreate`; `source` = `manual` or `imported_url` |
| `GET /skills/:id` | `Skill` |
| `PUT /skills/:id` | `SkillUpdate` (partial); bumps version |
| `DELETE /skills/:id` | cascades `agent_skills` |
| `GET /skills/:id/versions` | `SkillVersion[]`, newest first |
| `GET /skills/:id/stats` | `SkillStats` |
| `POST /skills/import/preview` | `SkillImportPreviewBody` → `SkillImportPreview`; **persists nothing** |
| `GET/POST /agents/:id/skills` (existing) | links carry `enabled`; skill ids must belong to the caller's workspace |

Contracts live in `vendor/shared/contracts/knowledge.ts` (both copies).

## Import (.md only)
Client sends file text. Server: reject > 100 KB; parse optional YAML-ish
front-matter (`name`, `description`, `type`); fall back to first `# heading`
and first paragraph; unknown `type` → `custom` + warning. Warn if the body
contains fenced code with shell/`curl`-like content or URLs ("not executed,
but will be shown to the model"). No archives, no file writes, no network.

## Prompt assembly
`run-executor` loads the agent's linked skills, keeps enabled ones in `order`,
and passes `{name, body, trusted}[]` to reviewer-core (`trusted = source ===
'manual'`). reviewer-core renders `### <name>` blocks under `## Skills / rules`,
wrapping untrusted ones with `wrapUntrusted`. `run_traces.prompt_assembly.skills`
holds the block; the trace also exposes per-skill name + estimated tokens
(`ceil(chars/4)`). Disabled skills never appear.

## Stats
- `used_by` = agents bound (any `enabled`).
- `pull_pct` = share of runs of bound agents (last 30d) in which the skill was
  included; `accept_pct` and `findings_30d`/`by_category` from findings of those
  runs. `null`/`0` when there is no data — never fabricated.

## Seed
New agent **Test Quality Reviewer** (uncovered branches, missed corner cases,
over-mocking, flakes) bound to 4 skills: `uncovered-branches`,
`edge-case-checklist`, `over-mocking-guard` (manual) and `flaky-test-detector`
(imported through the UI from `server/fixtures/skills/flaky-test-detector.md`).

## Tests
Unit: import parser, token estimate, prompt block builder. Integration
(`*.it.test.ts`): CRUD + versioning, workspace isolation on binding, run
assembly (enabled skill present, disabled absent, order respected).
