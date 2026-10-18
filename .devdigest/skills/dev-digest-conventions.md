# Repo conventions

Follow these conventions when writing or reviewing code in this repository.

- Use a constants file for page-specific constants (e.g., status colors, grid templates).
  - evidence: `client/src/app/repos/[repoId]/pulls/constants.ts#L1`
- Use `Record` for mapping objects with string keys.
  - evidence: `client/src/app/repos/[repoId]/pulls/constants.ts#L10`
- Co-locate styles in a separate file using a `s` object with `satisfies CSSProperties`.
  - evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/styles.ts#L4`
- Use CSS custom properties (var(--...)) for theming.
  - evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/styles.ts#L7`
- Use functions for dynamic styles that accept parameters.
  - evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/styles.ts#L22`
- Use phase tags (e.g., [T1], [T2]) in comments to indicate implementation status.
  - evidence: `server/src/modules/repo-intel/constants.ts#L13`
- Use `as const` for readonly arrays of constants.
  - evidence: `server/src/modules/repo-intel/constants.ts#L14`