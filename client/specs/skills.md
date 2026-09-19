# Skills (client)

Server contract: [../../server/specs/skills.md](../../server/specs/skills.md).

## Routes
`/skills` — card grid like `/agents` (`SkillsListView` + `SkillCard`: search,
`Add Skill ▾`, toggle, delete, click → `/skills/:id?tab=config`).
`/skills/[id]` and `/skills/new` — master-detail in `AppShell` (crumb
`Skills Lab › Skills`), same layout as `/agents/[id]`. `?tab=` holds the tab.
Sidebar: `Skills` item (`g s`).

## Left column — list
Title, `+ Add Skill ▾` (Create new · Import .md), search box. Each item:
name, enabled `Toggle` (global), 1-line description, type badge, source badge
(Manual / Extracted / Community / Imported), footer `N agents · X% pull · Y%
accept` (`—` when null). Disabled items dimmed. Active item highlighted.

## Right column — detail
Header: name, type badge, `v{n}`, `Run on evals` (disabled, "coming soon").
Tabs:
- **Config** — Enabled toggle; Name*; Description (helper text: write it as a
  directive — it is the skill's interface); Type select; Skill body* in a
  monospace editor with line numbers, `<name>.md` chip, `unsaved` marker and
  live token count; Save / Cancel. `Create new` = same form, empty.
- **Preview** — rendered markdown + the exact block as it appears in the prompt.
- **Evals** — placeholder ("coming soon").
- **Stats** — tiles Used by / Pull frequency / Accept rate (ring) / Findings
  (30d); "Agents using this skill" (link per agent); "Findings by category"
  donut.
- **Versions** — list from `/skills/:id/versions`.

## Import modal
Pick `.md` → `POST /skills/import/preview` → editable preview + trust warning
("a foreign skill is foreign instructions inside your agent's prompt") →
**Confirm & save** (`POST /skills`, `source: imported_url`). Nothing is saved
before confirm; only text is read.

## Agent editor → Skills tab
`N of M enabled`, filter, rows = drag handle + checkbox + name + type badge;
order = prompt order; native HTML5 drag-and-drop (no new dependency). No Save
button: every checkbox toggle and drop persists at once via
`POST /agents/:id/skills` (optimistic, rolled back on error). The agent editor
also has Evals (placeholder) and Stats (`GET /agents/:id/stats`) tabs.

## Structure & tests
Hooks in `lib/hooks/skills.ts` (+ `keys.ts`); pages thin; components one per
folder under `_components/` with `styles.ts`/`constants.ts`/`index.ts` and a
`*.test.tsx` (mock the hooks module). Strings in `messages/en/skills.json`.
