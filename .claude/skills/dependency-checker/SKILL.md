---
name: dependency-checker
description: Analyses every dependency of the DevDigest repo and its packages (server, client, reviewer-core, mcp, e2e, evals, ...) and writes a structured report — Mermaid dependency maps, per-package size/weight tables (own + transitive), version drift, unused candidates, vendor/shared drift, package-boundary violations, internal module cycles, licenses, audit/outdated — ending with a prioritised P0–P3 action list and advice. Use whenever the user asks for a dependency check, dependency audit/report/map/graph, "what is heavy in node_modules", bundle or install size, unused or outdated packages, version drift, circular imports between modules, or before a release/upgrade. Also triggers on "перевір залежності", "залежності репозиторію", "схема залежностей", "скільки важить пакет", "dependency checker". Read-only; never edits package.json or lockfiles.
---

# Dependency Checker

Produces one report, `docs/dependency-reports/dependency-report-YYYY-MM-DD.md`, that a developer can read top to
bottom in five minutes: what depends on what (diagrams), what weighs what (tables), what is unhealthy, and what to
do first. Facts come from a deterministic script, so numbers are reproducible; your job is to verify, interpret and
prioritise them — not to estimate anything.

Supporting files: [priorities.md](priorities.md) (how to assign P0–P3), [report-template.md](report-template.md)
(the exact report structure). Script: [scripts/collect.mjs](scripts/collect.mjs).

## Why a script

An earlier hand-written report in `docs/dependency-reports/` listed packages (`moment`, `date-fns`, `playwright`)
that are not in any `package.json`. Sizes, versions and import edges must be measured, never recalled. The script
measures; you explain.

## Hard rules

- **Read-only.** Never edit `package.json`, `*/pnpm-lock.yaml` (do-not-touch per CLAUDE.md), `vendor/**`, and never
  run `pnpm install/update/add/remove`. Fixes are *recommendations* with the exact command for the human to run.
- **No invented numbers.** If the script returned `null`/`n/a` or a warning, write "not measured" and say why.
- **Every finding cites evidence** from the JSON (package, dependency, size, `file:line` of an import).
- **Candidates are not verdicts.** "Unused" and "boundary violation" are heuristics until you have checked them (step 3).

## Workflow

1. **Initiation.** Read `CLAUDE.md` ("Do-not-touch", "Non-default conventions"), `README.md#architecture` and the
   `AGENTS.md` of any package you will make a finding about (vendor rules live there; see `engineering-insights`).
2. **Collect.** From the repo root:
   ```bash
   node .claude/skills/dependency-checker/scripts/collect.mjs --online --out <scratchpad>/deps.json
   ```
   Drop `--online` if the user asked for offline; `--online` runs `pnpm audit` and `pnpm outdated` per package,
   which sends dependency names/versions to the npm registry. Takes ~10 s offline, longer online. Read the
   `warnings` array first: a package with no `node_modules` has no sizes, and a failed audit means "not run",
   not "clean". Do not run `pnpm install` to fix it — report the gap.
3. **Verify the heuristics.** The script is deliberately conservative about *what it claims*, so check before reporting:
   - each `usage: "unused-candidate"` dep → `grep -rn "<name>" <pkg>/ --include=* --exclude-dir=node_modules`
     plus the package's configs and scripts (dynamic imports, plugin strings, CLI use). Keep it a candidate
     ("verify") if you cannot decide; drop it if you find a real use. `peer-of-direct-dep` and `used-via-script` are fine.
   - `edges` of kind `relative-cross-package` or `alias-deep-import` → open the cited `file:line`, then check the
     owning `AGENTS.md` for whether that deep import is allowed.
   - `vendorDrift.differences` → `diff` a differing file to see whether it is a real contract change or noise.
   - `internalGraph.<pkg>.cyclesExcludingRoots` → open one edge's `sample` location per cycle to confirm it is a
     runtime import (not `import type`). Cycles that only exist through the composition root (`platform`) are
     listed separately as informational.
   - `runtimeEdges` come from docs, not code — confirm they still match `README.md#architecture`.
4. **Prioritise.** Apply [priorities.md](priorities.md). Rank within a level by impact (security > correctness >
   size > hygiene) and then by effort (cheap first).
5. **Write the report** to `docs/dependency-reports/dependency-report-<YYYY-MM-DD>.md` following
   [report-template.md](report-template.md). Paste the pre-rendered `render.*` blocks from the JSON verbatim
   (Mermaid graphs, size tables, heaviest list) rather than redrawing them — they are what makes two runs comparable.
   If a report for today exists, write `-2`, `-3`, … instead of overwriting.
6. **Reply in chat** (in the user's language, see memory) with: the report path, the 3–5 highest-priority findings
   in one line each, and anything you could not measure. Do not paste the report.

## Reading the numbers

- `ownBytes` is the dependency's own folder; `withDepsBytes` adds its transitive closure in the pnpm store.
  Closures overlap between dependencies, so **never sum `withDepsBytes`** — use `packages.<pkg>.totals`, which is
  de-duplicated (`prodBytes`, `devOnlyBytes`, `uniqueBytes`).
- These are install sizes on disk, not bundle sizes. A large `next` or `drizzle-kit` says nothing about what
  ships to the browser; say so when you comment on it, and recommend a bundle analyzer if client bundle size matters.
- `rangeDrift` (different semver ranges for the same dep) is informational; `versionDrift` (different *installed*
  versions) is the real signal.

## Done criteria

Before finishing, check: every section of the template is present (empty sections say "none found" with the check
that was run); every P0/P1 has evidence and a concrete command or file to change; no number in the report is absent
from the JSON; the Mermaid blocks render (no stray characters in node labels).
