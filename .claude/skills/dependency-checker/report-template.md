# Report template

Write the report in English, with exactly these sections in this order. A section with nothing to report stays,
with "None found" and the check that was run. Paste `render.*` blocks verbatim from the JSON.

````markdown
# Dependency Report — YYYY-MM-DD

> Branch `<git branch>` · commit `<short sha>` · mode: online | offline · packages: <comma list>
> Generated with the `dependency-checker` skill. Sizes are on-disk install sizes, not bundle sizes.

## 1. Summary

3–6 bullets, most important first: totals (de-duplicated `uniqueBytes` across packages), the heaviest package and why,
counts of findings by level (`P0: n · P1: n · P2: n · P3: n`), and the one thing to do first.

## 2. Dependency map

### 2.1 Packages
`render.packageGraph` — then a legend: solid = source alias, dotted = vendored / documented runtime link,
thick red = boundary violation (only if present).

### 2.2 Internal modules
One `render.internalGraphs.<pkg>` block per package that has one (server, mcp, …), with a one-line reading of
each (e.g. "21 groups, 76 edges, 2 cycles — highlighted in red"). Cycles via the composition root are listed in text only.

## 3. Weight

### 3.1 Per-package totals
| Package | Prod | Dev-only | Total (unique) | node_modules | Heaviest dependency |
|---|---|---|---|---|---|
(from `packages.<pkg>.totals`; mark packages without `node_modules` "not installed")

### 3.2 Heaviest dependencies repo-wide
`render.topHeaviest`.

### 3.3 Per-package breakdown
`render.sizeTables.<pkg>` under a `####` heading per package, followed by one sentence on what dominates.

## 4. Health

### 4.1 Security (audit)
Counts per package and severity, then a table of advisories (package, dependency, severity, title, patched in).
Offline run → "Not run (offline mode)". Failed → "Not run: <reason>". Never write "clean" for a check that did not run.

### 4.2 Outdated
Table: package, dependency, current, latest, kind (prod/dev), major gap?

### 4.3 Version drift
`versionDrift` table (dep, versions → packages), then `rangeDrift` as a short informational list.

### 4.4 Unused candidates
Table: package, dependency, kind, size, **verification** (what you grepped, result). Only `unused-candidate`
entries; label unconfirmed ones "verify".

### 4.5 Licenses
Counts per license per package; list every flagged entry (`licenseFlags`) with the package that pulls it in.

### 4.6 Boundaries and vendor drift
- Cross-package edges that are not the sanctioned alias/vendor pattern (kind, `file:line`, verdict after reading `AGENTS.md`).
- `vendor/shared` drift: identical or the list of differing files, and whether the differences are real.
- Internal cycles (`cyclesExcludingRoots`) with the edge `sample` locations.

## 5. Prioritised actions

One table, ordered P0 → P3 and by impact within a level:

| # | Level | Finding | Evidence | Action (exact command / file) | Effort |
|---|---|---|---|---|---|

## 6. Advice

3–5 bullets that follow from the evidence (see priorities.md, "Advice section").

## 7. Method and limits

What was run (script, flags, date), what was not measured and why (warnings), and the known blind spots:
size ≠ bundle size, unused detection is textual, runtime edges come from docs, transitive overlap.
````
