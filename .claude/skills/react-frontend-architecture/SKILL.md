---
name: react-frontend-architecture
description: "Where things live in a React/Next.js frontend: folder structure, component splitting, constants, utils/helpers, hooks, business logic, server vs client boundary, barrel files. Use when creating a component/feature, deciding where to put a constant, helper, hook or type, splitting a large component, or reviewing frontend file organization. Includes the DevDigest client/ overlay."
---

# React Frontend Architecture

Answers "where does X go?" Complements `react-best-practices` (hooks/anti-patterns/perf) and
`next-best-practices` (file conventions/RSC). Numbers like **[S1]** refer to the source registry in
[README.md](README.md).

**Core rule — colocate first, promote later.** Put code as close as possible to where it is used
[S17]. Move it up only when a second consumer appears [S2]; abstract on the third repetition [S20].

## 1. Decision table: where does it go?

| Thing | Default location | Promote to shared when |
|---|---|---|
| Sub-component used by one parent | Same file (if trivial, <~100 lines) or `_components/` inside the parent's folder [S2][S3] | 2+ features use it |
| Component with tests/styles/helpers | Its own PascalCase folder + `index.ts` [S2][S3] | 2+ features use it → shared `components/` |
| Constants | `constants.ts` next to the consumer [S2] | 2+ features use it → shared `constants`/`config` |
| Pure helper (formatting, mapping, sorting) | `helpers.ts` next to the consumer, or the same file if used once [S2][S17] | 2+ features use it → shared `lib/`/`utils` |
| Type | Next to the consumer; derive from Zod (`z.infer`) when a schema exists [S2] | 2+ features use it → shared types / contracts package |
| Hook using component state only | Same folder as the component [S2][S3] | Reused → shared `hooks/` |
| Data-fetching hook (query/mutation) | Feature/data-layer hooks file; components never call `fetch` [S21] | — |
| Business/domain rules (no React) | Plain functions in `helpers.ts`/`lib/`, unit-tested without React | — |
| UI-only state (open/closed, tab) | Local `useState` in the lowest component that needs it [S18][S19] | Lift only when siblings need it |
| Server data | Query cache (TanStack Query), never copied into `useState` [S19][S21] | — |
| Tests | Next to the file, same base name [S17] | e2e/integration at package root |

## 2. Folder structure

- **Organize by feature/route, not by file type**, once past ~15–20 components [S1][S2][S5]. Type-folders
  (`components/ hooks/ helpers/`) are fine for genuinely shared code [S3].
- **One-way imports: shared → features → app.** Features never import from other features or from
  `app`; compose features at the app/page layer [S1][S2]. Enforce with `import/no-restricted-paths`.
- **Delete-test:** removing a feature folder must not break unrelated features [S2].
- Next.js App Router: files in `app/` are safe to colocate — only `page`/`route` become public [S8].
  Use private folders (`_components`, `_lib`) to separate UI from routing and avoid clashes with future
  file conventions [S7][S8]. Route groups `(x)` organize without changing URLs [S7].
- Don't nest deeper than ~2 levels inside a component folder [S2]. Use path aliases (`@/…`) over
  `../../..` [S3].
- Grow gradually: one file → several files → component folder. Don't create empty scaffolding [S2].

## 3. Splitting components

- **Pages are thin.** `page.tsx` fetches/composes and renders a feature view; logic lives in colocated
  components [S9].
- **Split by responsibility, not by line count**: extract when a piece is reused, has its own state/tests,
  or the parent exceeds ~100–150 lines or mixes concerns [S2].
- **Separate logic from view with custom hooks, not container/presentational wrapper pairs.** The
  container/presentational split's author no longer recommends it as a rule — hooks give the same
  separation without the extra layer [S14][S15].
- Keep tightly coupled parent/child (e.g. `List` + `ListItem`) together; use the compound pattern when
  related pieces share state and want a flexible API [S2][S16].
- Prefer composition (`children`, slots) over prop explosion and boolean-flag components.

## 4. Hooks vs helpers vs components

- **Hook** only if it calls React hooks. Otherwise it is a plain function — do **not** prefix with `use`
  [S12].
- Extract a hook for: repeated stateful logic, Effects (wrap them), syncing with external systems. Do not
  extract for a single `useState`, and avoid generic lifecycle wrappers like `useMount` [S12].
- Custom hooks share *logic*, not *state* — sharing state means lifting it or using context/query cache [S12].
- Before writing `useEffect`: derive during render, handle in event handlers, or use the query layer.
  Effects are only for syncing with external systems [S13].
- **Helper/util**: pure, no React, no I/O — easiest to test. Business rules go here (or in the server /
  shared contracts if they must agree across packages).
- **Don't extract prematurely into a global `utils/`** — it becomes a dumping ground. Wrong abstraction
  costs more than duplication [S17][S20].

## 5. Data layer (TanStack Query)

- One hooks module per domain; export **custom hooks only**, keep query functions and keys private [S21].
- Key factory per domain, generic → specific (`all → lists → list(filters) → detail(id)`) [S21].
- Server state stays in the cache; don't mirror it into local state. Use `select` for view-shaped data [S19][S21].
- All network access via one API client module; components never call `fetch` directly.

## 6. Server vs client (Next.js)

- Default to Server Components; add `'use client'` only at interactive leaves (state, handlers, effects,
  browser APIs, custom hooks) [S9].
- `'use client'` marks a boundary — everything imported below it ships to the client, so mark the smallest
  file, never a whole page/layout for one `onClick` [S9][S10].
- Pass Server Components into Client Components via `children`/props, not by importing them [S9][S11].
- Render context providers as deep as possible, wrapping `{children}` not `<html>` [S9].
- Server-only code (secrets, DB) gets `import 'server-only'` [S9].

## 7. Barrel files (`index.ts`)

- Use **only** a per-component `index.ts` re-exporting that one component (public API of the folder) [S2][S3].
- Avoid big cross-feature/package barrels: they hurt tree-shaking, dev-server memory and `tsc`, and cause
  cycles [S1][S22][S23]. Import from the concrete file across feature boundaries.

## 8. Naming

- Components/component folders `PascalCase`; hooks `useThing` (file kebab-case or camelCase — match the
  repo); helpers/constants lowercase files [S3].
- Constants: `as const` objects / union types instead of TS `enum`; SCREAMING_SNAKE only for true
  primitives.
- Files singular per concept (`features/project`, not `projects`) [S2].

## 9. DevDigest overlay (`client/`)

These override the generic advice above when they differ. Also read `client/AGENTS.md`.

- Pages: `src/app/**/page.tsx` stay thin; feature UI in `_components/<PascalName>/` (folder + component
  PascalCase), with lowercase siblings `helpers.ts`, `styles.ts`, `constants.ts`, `index.ts`
  (re-exports the component only), and `<Name>.test.tsx`.
- Nested sub-components go in a `_components/` folder inside the parent component folder (see
  `SettingsView/_components/`).
- Shared app-level UI: `src/components/<kebab-name>/`. Non-component lib files kebab-case in `src/lib/`
  (`github-urls.ts`, `repo-context.tsx`).
- Data: `src/lib/hooks/*.ts` (TanStack Query) → `src/lib/api.ts`. Components never call `fetch`.
- Strings: `messages/<locale>/*.json` (next-intl), never inline.
- Types/contracts: `@devdigest/shared` (`src/vendor/shared`) and UI primitives `@devdigest/ui`
  (`src/vendor/ui`) are **vendored — do not edit in place**.
- Tests co-located: `<Name>.test.tsx`; real browser flows go in `e2e/`.
- Validate: `pnpm typecheck` + `pnpm test` in `client/`.

## Review checklist

1. Can this live one level closer to its only consumer?
2. Is anything in shared/`utils` used by only one feature?
3. Does any feature import another feature or `app`?
4. Is business logic inside JSX/effects instead of a pure function or hook?
5. Is `'use client'` on more than the interactive leaf?
6. Did a new barrel file appear beyond a per-component `index.ts`?
7. Is server data copied into local state, or `fetch` called in a component?
