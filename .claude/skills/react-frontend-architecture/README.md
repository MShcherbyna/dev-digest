# react-frontend-architecture — sources

Source registry for [SKILL.md](SKILL.md). Rules in SKILL.md cite these as **[S#]**.
Status: **Read** = full page fetched and rules extracted (2026-09-19); **Snippet** = only seen in
search results, verify before relying on it.

## A. Folder structure / architecture

| # | Source | URL | What we took | Status |
|---|---|---|---|---|
| S1 | Bulletproof React — project structure | https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md | `shared → features → app`; no cross-feature imports; ESLint `import/no-restricted-paths`; avoid barrels | Read |
| S2 | Robin Wieruch — React Folder Structure 2026 | https://www.robinwieruch.de/react-folder-structure/ | Gradual evolution; "≥2 consumers → shared"; where constants/utils/types/hooks go; delete-test; ≤2 nesting levels | Read |
| S3 | Josh W. Comeau — React File/Directory Structure | https://www.joshwcomeau.com/react/file-structure/ | Component folder + `index.ts`; helpers/hooks/constants placement; path aliases. **Contested:** organizes by function, not feature | Read |
| S4 | Feature-Sliced Design — overview | https://feature-sliced.design/docs/get-started/overview | Layers/slices/segments vocabulary; import only downward. Not adopted wholesale (heavier than needed) | Snippet |
| S5 | Profy — Popular React Folder Structures & Screaming Architecture | https://profy.dev/article/react-folder-structure | Feature-based past ~15–20 components | Snippet |
| S6 | Sandro Roth — How to structure your React projects | https://sandroroth.com/blog/project-structure/ | Cross-check for S1/S2 | Snippet |

## B. Next.js App Router

| # | Source | URL | What we took | Status |
|---|---|---|---|---|
| S7 | Next.js — Project structure | https://nextjs.org/docs/app/getting-started/project-structure | Private folders `_x`, route groups, colocation strategies, "be consistent" | Read |
| S8 | Next.js — Project organization / colocation | https://nextjs.org/docs/app/building-your-application/routing/colocation | Only `page`/`route` are public; colocated files are safe | Snippet (content also covered by S7) |
| S9 | Next.js — Server and Client Components | https://nextjs.org/docs/app/getting-started/server-and-client-components | When server vs client; `'use client'` at leaves; children slots; providers deep; `server-only` | Read |
| S10 | Next.js — Server and Client Boundary guide | https://nextjs.org/docs/app/guides/server-and-client-boundary | Boundary semantics | Snippet |
| S11 | Next.js — Composition patterns (v14 URL) | https://nextjs.org/docs/14/app/building-your-application/rendering/composition-patterns | Interleaving patterns; superseded by S9 | Snippet |

## C. Component splitting / logic vs UI

| # | Source | URL | What we took | Status |
|---|---|---|---|---|
| S12 | React — Reusing logic with custom hooks | https://react.dev/learn/reusing-logic-with-custom-hooks | When to extract; `use` prefix only if hooks called; no lifecycle wrappers; share logic not state | Read |
| S13 | React — You Might Not Need an Effect | https://react.dev/learn/you-might-not-need-an-effect | Derive in render; events over effects | Snippet |
| S14 | Dan Abramov — Presentational and Container Components | https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0 | His 2019 update: no longer recommends the split; hooks replace it | Snippet |
| S15 | Patterns.dev — Container/Presentational | https://www.patterns.dev/react/presentational-container-pattern/ | Hooks reduce the need for the extra wrapper layer | Snippet |
| S16 | Patterns.dev — Compound pattern | https://www.patterns.dev/react/compound-pattern/ | Compound components with context | Snippet |

## D. Colocation, state, abstraction

| # | Source | URL | What we took | Status |
|---|---|---|---|---|
| S17 | Kent C. Dodds — Colocation | https://kentcdodds.com/blog/colocation | "Place code as close to where it's relevant as possible"; keep helpers/tests/state local | Read |
| S18 | Kent C. Dodds — State colocation will make your React app faster | https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster | Push state down, lift only when needed | Snippet |
| S19 | Kent C. Dodds — Application State Management with React | https://kentcdodds.com/blog/application-state-management-with-react | Server cache vs UI state split | Snippet |
| S20 | Kent C. Dodds — AHA Programming | https://kentcdodds.com/blog/aha-programming | Abstract on the third occurrence; prefer duplication to the wrong abstraction | Read |

## E. Data layer

| # | Source | URL | What we took | Status |
|---|---|---|---|---|
| S21 | TkDodo — Effective React Query Keys (Practical React Query series) | https://tkdodo.eu/blog/effective-react-query-keys | Keys colocated per feature; key factories; export only custom hooks. Series index: https://tanstack.com/query/latest/docs/community-resources | Read |

## F. Barrel files

| # | Source | URL | What we took | Status |
|---|---|---|---|---|
| S22 | Vercel — How we optimized package imports in Next.js | https://vercel.com/blog/how-we-optimized-package-imports-in-next-js | Barrel cost; `optimizePackageImports` for third-party libs | Snippet |
| S23 | Next.js discussion #92926 — Barrel imports | https://github.com/vercel/next.js/discussions/92926 | Own-code barrels hurt dev memory/tsc | Snippet |

## Contested / judgment calls

- **By feature (S1, S2, S5) vs by function (S3).** We follow feature/route colocation for feature code
  (matches Next.js `_components` colocation, S7) and type-folders only for shared code.
- **Container/presentational (S14, S15).** Kept as a concept, dropped as a mandatory file split.
- **Component-folder `index.ts` (S2, S3) vs barrel-avoidance (S1, S22, S23).** Allowed only as a
  one-component re-export per folder; no aggregate barrels.

## Still to research before v2

- Constants/enums in TypeScript (`as const` vs `enum`) — TS handbook, Matt Pocock
- Forms (React Hook Form + Zod), next-intl docs
- Testing strategy (Kent C. Dodds "Write tests. Not too many. Mostly integration.")
- Error/loading boundaries, accessibility minimums
- Read in full the remaining **Snippet** sources (S4–S6, S8, S10, S11, S13–S16, S18, S19, S22, S23)
