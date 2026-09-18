# Insights — client/

Durable findings discovered while working in this package that aren't
obvious from the code or `README.md`. Append-only: correct a stale entry
with a dated note beneath it rather than editing it away. Sections are
fixed — add to the one that fits, never invent a new heading. Written and
read by the `engineering-insights` skill.

## Decisions

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-09-18** — The PR list has no "Findings" column live in
  `PRRow.tsx`/`constants.ts` (`COLUMN_KEYS` has no `findings` entry) even
  though design screenshots show one — but a matching unused type,
  `PrRowView.findings: { CRITICAL, WARNING, SUGGESTION }`, already sits at
  `client/src/lib/types.ts:37-48` with zero other references. Before
  building a findings-count UI, check for this kind of pre-staged
  dead type/view-model instead of inventing a new shape.
- **2026-09-18** — No Popover/Tooltip primitive exists anywhere under
  `src/vendor/ui/kit/` (only `Modal.tsx`, `Drawer.tsx`, `Dropdown.tsx`).
  `Dropdown.tsx` is the closest analog but is click+outside-click only, no
  hover support — any hover-triggered UI has to be built from scratch.

## Tool & Library Notes

## Recurring Errors & Fixes

- **2026-09-18** — Loading a `/repos/:repoId/pulls...` URL directly (full
  page navigation, not an in-app click) shows "No repo selected" even
  though the repo exists in the DB — the selected-repo state isn't restored
  from the URL on a fresh load. Land on `/` (or click the repo in the
  sidebar) first and let the app's own client-side redirect restore
  selection, then navigate — relevant whenever browser-testing this app by
  deep-linking rather than clicking through.

## Session Notes

## Open Questions
