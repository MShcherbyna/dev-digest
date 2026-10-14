# Prioritisation rubric

Assign each finding exactly one level. When a finding fits two, take the higher. The point of the levels is that a
developer can stop reading after P1 and still have done the important work, so keep P0/P1 short and evidenced.

| Level | Meaning | Examples (from the JSON) | Typical effort |
|---|---|---|---|
| **P0 — fix now** | Security or correctness risk that is live today | `audit` critical/high advisory on a **prod** dependency with a patched version; copyleft/unknown license in a **prod** dependency of shipped code; runtime import cycle between feature modules (excluding composition root); a package reaching into another package's internals (`relative-cross-package`) | hours |
| **P1 — this sprint** | Hurts reliability or review quality, or is cheap to fix and clearly wrong | moderate advisories on prod deps; `vendorDrift` with real contract differences between `vendor/shared` copies; confirmed-unused **prod** dependency; same dep at different *installed* major versions across packages; `alias-deep-import` that `AGENTS.md` does not allow | hours–1 day |
| **P2 — plan it** | Weight or maintenance debt without immediate harm | a prod dependency > 30% of its package's `prodBytes` with a lighter alternative; outdated by ≥1 major; confirmed-unused **dev** dependency; low advisories on dev deps; cycles that exist only via the composition root | days |
| **P3 — hygiene** | Nice to have | minor/patch drift, `rangeDrift`, dev tooling duplicated across packages, deprecated-but-working packages | opportunistic |

## Rules of thumb

- **Prod vs dev matters.** The same advisory is P0 in `dependencies` and P2–P3 in `devDependencies` (it does not ship).
- **Size alone is never P0.** Weight becomes P1/P2 only when you can name a cheaper path (remove, lazy-load,
  lighter alternative, move to devDependencies). A big, load-bearing framework (`next`) is context, not a finding.
- **Unverified = say so.** An unused *candidate* that you could not confirm goes in P2 with the label "verify", never P1.
- **Vendored code is edited at its source.** For `vendor/**` findings, the action is "re-sync from the source of
  truth (see the owning `AGENTS.md`)", never "edit the copy".
- **Lockfiles and migrations are do-not-touch.** Actions that change versions are phrased as
  "run `pnpm update <dep>` in `<pkg>/`", for the human.

## Advice section

After the action list, add 3–5 short pieces of advice that generalise beyond single findings, e.g. which
dependency family is driving weight and why, a rule to prevent a recurring drift (CI check, `pnpm.overrides`),
or a boundary worth enforcing with `dependency-cruiser` (already a `server` dependency). Advice must follow from
the evidence above it; no generic best-practice filler.
