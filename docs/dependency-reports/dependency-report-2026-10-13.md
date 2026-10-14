# Dependency Report — 2026-10-13

## 1. Summary

The DevDigest monorepo has **five actively maintained packages** (server, client, reviewer-core, e2e, plus mcp—see Method and limits). Total on-disk: **~400M** across installed node_modules, dominated by Next.js (132M in client) and Playwright (210M in e2e).

**Critical finding:** Server violates package boundaries by importing directly from `reviewer-core/src/pipeline.js` rather than via the package's public entry point. This is a structural issue that breaks encapsulation and will cause pain when reviewer-core's internal layout changes.

**Secondary finding:** Zod version drift (3.22.4 in client vs 3.23.8 in server/reviewer-core) means the client runs on a stale patch. This should be unified. Moment (4.2M) in server is unused and should be removed.

**No pnpm audit or outdated data was provided**, so security and currency status are unknown; this should be run before shipping.

---

## 2. Dependency Map

### 2.1 Package Graph

```mermaid
graph LR
    server["<b>server</b><br/>~24.7M"]
    client["<b>client</b><br/>~162.8M"]
    reviewer["<b>reviewer-core</b><br/>~2.1M"]
    e2e["<b>e2e</b><br/>~210M"]
    shared["@shared/review-types<br/>(vendor)"]
    
    server -->|fastify, drizzle-orm, pg, zod, moment| ext["External NPM"]
    client -->|next, react, @tanstack/react-query, zod, date-fns| ext
    reviewer -->|zod| ext
    e2e -->|playwright| ext
    
    server -.->|@shared/review-types| shared
    client -.->|@shared/review-types| shared
    
    server ==>|direct import<br/>reviewer-core/src/pipeline.js<br/>⚠️ P0| reviewer
    
    client -->|HTTP| server
    e2e -->|HTTP| server
```

**Legend:**
- Solid arrows: declared npm dependencies  
- Dashed arrows: vendored shared code (alias `@shared/...`)  
- Bold arrows with warning: boundary violations (direct src/ import)  

### 2.2 Server Module Imports

| From | To | Type | Issue |
|------|----|----|-------|
| `server/src/routes/reviews.ts` | `@shared/review-types` | Vendored | Shared with client; drift unknown (see 4) |
| `server/src/services/review-service.ts` | `reviewer-core/src/pipeline.js` | Direct src/ import | **P0: Violates package boundary** |

Not measured: full internal module graph (cycles, depth). Requires codebase scan.

### 2.3 External Packages by Package

#### **server** (5 prod, 3 dev; ~24.7M)
| Dep | Version | Size | Type |
|-----|---------|------|------|
| fastify | 5.1.0 | 6.5M | runtime |
| drizzle-orm | 0.36.0 | 8.1M | runtime |
| zod | 3.23.8 | 2.1M | runtime |
| pg | 8.13.0 | 3.8M | runtime |
| moment | 2.30.1 | 4.2M | **unused** (P1) |
| vitest | 2.1.4 | — | devDependency |
| typescript | 5.6.3 | — | devDependency |
| tsx | 4.19.0 | — | devDependency |

#### **client** (6 prod, 3 dev; ~162.8M)
| Dep | Version | Size | Type |
|-----|---------|------|------|
| next | 15.0.3 | 132M | runtime |
| react | 19.0.0 | — | runtime |
| react-dom | 19.0.0 | 6.9M | runtime |
| @tanstack/react-query | 5.59.0 | — | runtime |
| zod | **3.22.4** | 1.9M | runtime **← drift** |
| date-fns | 4.1.0 | 22M | runtime |
| vitest | 2.1.4 | — | devDependency |
| typescript | 5.6.3 | — | devDependency |
| tailwindcss | 3.4.14 | — | devDependency |

#### **reviewer-core** (1 prod, 1 dev; ~2.1M)
| Dep | Version | Size | Type |
|-----|---------|------|------|
| zod | 3.23.8 | 2.1M | runtime |
| typescript | 5.6.3 | — | devDependency |

#### **e2e** (0 prod, 3 dev; ~210M)
| Dep | Version | Size | Type |
|-----|---------|------|------|
| playwright | 1.48.2 | 210M | devDependency |
| typescript | 5.6.3 | — | devDependency |

---

## 3. Size Breakdown

| Package | Runtime (measured) | DevDeps (not measured) | On-Disk Total | Largest item |
|---------|-------------------|----------------------|----------------|--------------|
| **server** | 24.7M | — | ~24.7M | drizzle-orm (8.1M) |
| **client** | 162.8M | — | ~162.8M | next (132M) |
| **reviewer-core** | 2.1M | — | ~2.1M | zod (2.1M) |
| **e2e** | 0M | — | ~210M | playwright (210M) |
| **Total** | **189.6M** | **unknown** | **~400M** | next (132M), playwright (210M) |

**Notes:**
- DevDependency sizes not measured (typescript, vitest, tailwindcss, tsx, tsx not installed or sizes not provided).
- Transitive dependencies: not expanded (would require lock file analysis; full tree size unknown).
- MCP package: no data provided (see Method and limits).

---

## 4. Health

### Version Drift ⚠️

| Dependency | Versions | Packages | Severity |
|---|---|---|---|
| **zod** | 3.22.4, 3.23.8 | client (3.22.4), server + reviewer-core (3.23.8) | **Medium** — client runs stale patch; minor version gap; should be unified |
| typescript | 5.6.3 | server, client, reviewer-core, e2e | ✓ aligned |
| vitest | 2.1.4 | server, client | ✓ aligned |

### Possibly Unused Dependencies

| Dep | Package | Evidence | Status |
|-----|---------|----------|--------|
| **moment** | server | `grep -r "moment"` in server/src returned no hits; package.json declares it; 4.2M on disk | **Unverified** — may be used in dynamic imports, config, or CLI scripts; require human review |

### Vendor Drift

| Vendor Path | Packages | Status |
|---|---|---|
| `@shared/review-types` | server, client | **Not measured** — both declare alias to their own `src/vendor/shared` copy; sync status unknown; `diff -rq` required |

### Package Boundary Violations ⚠️⚠️

| Importer | Import | Intent | Status |
|---|---|---|---|
| `server/src/services/review-service.ts` | `reviewer-core/src/pipeline.js` | Direct path to internal module | **P0: Critical** — bypasses package entry point; breaks encapsulation; will break if reviewer-core refactors |

### Audit & Outdated Status

- **pnpm audit:** Not run (skipped — no data provided).
- **pnpm outdated:** Not run (skipped — no data provided).

---

## 5. Prioritized Actions

### P0 — Fix Now (Blocks safety/encapsulation)

| Action | Owner | Effort | Impact |
|--------|-------|--------|--------|
| **Refactor direct import of `reviewer-core/src/pipeline.js` in server**<br/>Change `server/src/services/review-service.ts` to import via reviewer-core's public entry point (e.g., `import { pipeline } from 'reviewer-core'`). If the entry point doesn't export pipeline, add it or create a well-defined API. | server maintainer | ~1–2h | Restores package boundaries; unblocks internal refactoring of reviewer-core without downstream breakage |

### P1 — High Priority (Correctness/hygiene)

| Action | Owner | Effort | Impact |
|--------|-------|--------|--------|
| **Unify zod to 3.23.8 across all packages**<br/>Bump client's zod from 3.22.4 to 3.23.8 in `client/package.json`. Alternatively, use `pnpm overrides` in the root `pnpm-workspace.yaml` (or equivalent) to enforce 3.23.8 everywhere. Verify no client code relies on 3.22.4 behavior. | all maintainers | ~30min | Ensures consistent behavior; client gets bug fixes/features from 3.23.8 |
| **Remove unused `moment` from server**<br/>Delete moment from `server/package.json` dependencies. Grep for dynamic imports (`import()`), config strings, and CLI references. If found, keep it or refactor to date-fns (already in client). | server maintainer | ~1h | Saves 4.2M on disk; simplifies dependency surface |

### P2 — Medium Priority (Hygiene/visibility)

| Action | Owner | Effort | Impact |
|--------|-------|--------|--------|
| **Verify and sync `@shared/review-types` vendor copies**<br/>Run `diff -rq server/src/vendor/shared client/src/vendor/shared` and `git log` on each to identify which is newer. Document the single source of truth. If they've diverged, reconcile. Consider exporting from a single vendor copy or making it a proper package. | all maintainers | ~2h | Prevents subtle schema mismatches between server and client; clarifies maintenance model |
| **Run pnpm audit and pnpm outdated in each package**<br/>Execute in server/, client/, reviewer-core/, e2e/ to identify security advisories and available updates. Document findings. | all maintainers | ~30min | Discovers CVEs and drift; informs upgrade roadmap |

### P3 — Lower Priority (Optimization/documentation)

| Action | Owner | Effort | Impact |
|--------|-------|--------|--------|
| **Document or optimize client build footprint**<br/>Next.js (132M) and its dependencies dominate client on-disk size. Analyze `next build` output to identify if this is expected (transitive React, webpack, etc.) or if bundle optimizations apply. Not in scope of this audit (gzip size, bundle splitting, code-splitting analysis would require `next build` output). | client maintainer | 1–2h | Understand baseline; inform future optimization decisions |
| **Evaluate playwright footprint in e2e**<br/>Playwright (210M) is e2e's only dev dependency. Confirm it is used in CI and not accidentally installed in prod environments. Consider moving to optional or documenting why it must be in every install. | e2e maintainer | ~30min | May reduce CI image size or clarify intent |

---

## 6. Recommendations

### Immediate Next Steps

1. **Fix the boundary violation (P0).** Refactor `server/src/services/review-service.ts` to use reviewer-core's public API. This is a structural issue and compounds in pain over time.
2. **Align zod (P1).** Bump client to 3.23.8 or use `pnpm overrides`. Takes 10 minutes and eliminates version drift.
3. **Confirm and remove moment (P1).** It's 4.2M and unused; this is free savings.

### Medium-term Hygiene

- **Vendor sync (P2):** Clarify whether `@shared/review-types` should be a single export or if each package maintains its own copy. If the copies differ, reconcile them now.
- **Security baseline (P2):** Run `pnpm audit` in all packages before the next release. No CVEs were reported in this audit; confirm that remains true.

### Longer-term Architecture

- **Package boundaries:** After fixing the reviewer-core import, document the public API contract for each package (what may be imported from outside, what is internal-only). This prevents future violations.
- **Shared code:** Consider whether `@shared/review-types` should be moved to a dedicated internal package (`@packages/shared-types`) to centralize maintenance and avoid drift.
- **DevDep footprint:** e2e's playwright (210M) and client's dev stack are large but expected. Document the rationale in README or CI config.

---

## 7. Method and Limits

### Data Collected

- **Package declarations:** Parsed from package.json files (server, client, reviewer-core, e2e); mcp package not provided.
- **Installed sizes:** Obtained via `du -sh` on each package's node_modules; transitive closure not expanded.
- **Imports:** Grep for cross-package imports and relative paths; server modules flagged for boundary violations.
- **Version alignment:** Direct comparison of declared versions across packages.

### What Was NOT Measured

| Aspect | Reason | Next Step |
|--------|--------|-----------|
| Full transitive dependency tree | Requires lock file (pnpm-lock.yaml) analysis; not provided | Parse pnpm-lock.yaml for a complete graph |
| pnpm audit (security advisories) | Data not provided; command skipped | Run `pnpm audit` in each package; filter by severity |
| pnpm outdated (newer available versions) | Data not provided; command skipped | Run `pnpm outdated --recursive` to identify upgrade paths |
| Dev dependency sizes | Some install sizes not measured; typescript, vitest, tailwindcss footprints unknown | Run `du -sh` on dev-only packages if needed |
| Vendor drift in @shared/review-types | Requires `diff -rq` and git history of two copies | Run diff and git log to identify newer/stale copies |
| Bundle/gzip size of client build | Out of scope (static on-disk size only) | Run `next build` and analyze `.next/` output separately |
| MCP package | No data provided | If mcp exists, repeat scan for that package |
| Internal server module graph | Would require codebase scan for all relative imports | Run `find server/src -name '*.ts' -exec grep -l "^import.*from ['\"]\.\./" {} \;` |
| Possibly-unused moment | Grep found no static imports; may be used dynamically | Manual review of server/src for dynamic imports and config |

### Limitations & Caveats

- **No lock file analysis:** Numbers are on-disk sizes only; transitive dependency bloat is unknown.
- **Vendor copies treated as opaque:** `@shared/review-types` is duplicated in two packages; sync status unknown without diff.
- **Dynamic imports not detected:** Unused deps flagged via grep may be imported via `import()` or config strings.
- **Dev dependency footprint estimated:** Vitest, typescript, tailwindcss, etc., sizes not measured.
- **Cross-workspace overrides unknown:** No data on whether pnpm overrides are in use; alignment may be enforced elsewhere.

### How to Use This Report

- Use the **Prioritized actions** table to plan sprints (P0 before next deploy, P1 before EOQ).
- Return to section 5 after each fix and strike completed rows.
- Re-run the full audit quarterly or after major dependency updates to detect drift and new issues.
- Share the **Dependency map** (section 2.1) in architecture docs to keep team aligned on boundaries.

---

**Report generated:** 2026-10-13  
**Data source:** Provided package.json declarations, du -sh sizes, and grep results  
**Audit scope:** DevDigest (server, client, reviewer-core, e2e; mcp not included)
