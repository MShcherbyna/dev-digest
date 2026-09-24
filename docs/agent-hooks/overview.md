# Agent guard hooks

Type: reference.

The `.claude/agents/*` sub-agents are constrained by `PreToolUse` hooks that
live in `.claude/hooks/`. Each hook is wired in the agent's own frontmatter
(for example the `hooks:` block in `.claude/agents/planner.md`), so it applies
only while that agent runs and never affects the main session. Every hook
follows the same contract: read the tool-call JSON on stdin, exit 0 to allow,
exit 2 to block (stderr is shown to the agent).

Out of scope: `.claude/hooks/pr-self-review-gate.sh` (wired for all Bash calls
in `.claude/settings.json`) and `.claude/hooks/duration-hook.sh` are
session-level hooks, not agent guards, and are not described here.

## Guards at a glance

Five scripts are wired to six agents: `readonly-bash-guard.sh` is used twice,
in `git` mode and in `verify` mode.

| Agent | Hook script | Tools it gates | Allows | Blocks | On bad input |
|---|---|---|---|---|---|
| planner | `.claude/hooks/planner-guard.sh` | Write path | `<root>/docs/plans/<feature>_en.md` and `_uk.md` (kebab-case name) | every other path | blocks, but only by accident (see limitations) |
| implementer | `.claude/hooks/implementer-guard.sh` | Edit, Write, Bash | everything not listed as blocked | Edit/Write on protected paths; `git commit`/`git push`; `db:migrate`; `sed -i`, `>`, `>>`, `tee` targeting protected paths | fails open |
| test-writer | `.claude/hooks/test-writer-guard.sh` | Edit, Write, Bash | Edit/Write on `*.test.ts(x)`, `client/src/test/*`, `server/test/helpers/*`, `INSIGHTS.md` | protected paths; commit/push; `db:migrate`; pnpm/npm/yarn dependency changes; `sed -i`, `tee`, any redirection except fd merges and `/dev/null` | fails closed |
| doc-writer | `.claude/hooks/doc-writer-guard.sh` | Edit, Write only | documentation allowlist (package `docs/<topic>.md`, package `README.md`, `server/src/modules/<name>/README.md`, root `README.md`, `docs/<section>/<topic>.md`) | `docs/plans/`, `INSIGHTS.md`, `CLAUDE.md`, `AGENTS.md`, `specs/`, `.claude/`, protected paths, anything outside the project | fails closed |
| architecture-reviewer | `.claude/hooks/readonly-bash-guard.sh git` | Bash | one plain read-only git command | everything else | fails closed |
| plan-verifier | `.claude/hooks/readonly-bash-guard.sh verify` | Bash | the `git` set plus typecheck/test/lint, targeted vitest, reviewer-core npm test | everything else | fails closed |

Protected paths (shared by implementer, test-writer and doc-writer):
`/vendor/shared/`, `client/src/vendor/ui/`, `server/src/db/migrations/`,
`pnpm-lock.yaml` (`implementer-guard.sh:18`, `test-writer-guard.sh:25`,
`doc-writer-guard.sh:52`). They mirror the "Do-not-touch" list in the root
`CLAUDE.md`.

## Decision flow

```mermaid
flowchart TD
  call[Agent tool call] -->|frontmatter PreToolUse| planner[planner-guard.sh]
  call -->|frontmatter PreToolUse| impl[implementer-guard.sh]
  call -->|frontmatter PreToolUse| tw[test-writer-guard.sh]
  call -->|frontmatter PreToolUse| dw[doc-writer-guard.sh]
  call -->|frontmatter PreToolUse| ro[readonly-bash-guard.sh git or verify]
  planner -->|path matches docs/plans/feature_en or _uk| allow[exit 0: allow]
  impl -->|no rule matched| allow
  tw -->|allowlisted test path or clean Bash| allow
  dw -->|documentation allowlist| allow
  ro -->|fullmatch on allowlist regex| allow
  planner -->|any other path| block[exit 2: block, stderr to agent]
  impl -->|protected path, commit/push, db:migrate| block
  tw -->|not allowlisted, or denied Bash pattern| block
  dw -->|denied name, off allowlist, bad input| block
  ro -->|metacharacter or off allowlist| block
```

## Per-hook details

### planner-guard.sh

Reads `tool_input.file_path` and matches it against
`^<root>/docs/plans/[a-z0-9][a-z0-9-]*_(en|uk)\.md$`, where `<root>` is
`CLAUDE_PROJECT_DIR` or `git rev-parse --show-toplevel`
(`.claude/hooks/planner-guard.sh:13-15`). Anything else exits 2.

### implementer-guard.sh

Edit/Write are checked against the protected-path regex. Bash commands are
checked for `git commit|push` (also with leading git flags), any `db:migrate`,
and `sed -i`/`>`/`>>`/`tee` followed by a protected path
(`.claude/hooks/implementer-guard.sh:20-37`).

### test-writer-guard.sh

Edit/Write paths are normalised (`os.path.normpath`) and must sit under
`CLAUDE_PROJECT_DIR`; the relative path must match one of four allow patterns
(`.claude/hooks/test-writer-guard.sh:41-46`). Bash is denied for commit/push,
`db:migrate`, dependency-changing pnpm/npm/yarn subcommands (including via
`npx pnpm@...`), `sed -i`, `tee`, and any `>` left after removing `N>&M` and
`>/dev/null` forms (`:51-72`). Unknown tools are blocked (`:74`).

### doc-writer-guard.sh

Accepts only Edit and Write with an absolute `file_path`. The path is resolved
with `os.path.realpath`, so symlinks and `..` cannot escape; the lexical path
is checked as well, and a path is allowed only if the real and lexical
relative paths are equal and match the allowlist
(`.claude/hooks/doc-writer-guard.sh:43-77`). Under `docs/<section>/`, the
topic filename must start with a lowercase letter or digit, so an uppercase
`README.md` is refused there (`:73`).

`AGENTS.md` is denied because `CLAUDE.md` is a symlink to it in every
package, so editing it would edit agent instructions
(`.claude/hooks/doc-writer-guard.sh:57`). The doc-writer therefore proposes
"Read when" lines in its report instead. A non-zero exit from the Python
process, including a crash, is turned into exit 2 (`:79-82`).

### readonly-bash-guard.sh

Takes a mode argument, `git` or `verify`; an unknown mode blocks. The command
is rejected first if it contains a newline or any of `; & | < > \` $ \`
(`.claude/hooks/readonly-bash-guard.sh:39`). It must then `fullmatch` an
anchored regex:

- `git` mode: `git [-C <dir>]` followed by `diff|status|log|show|merge-base|
  rev-parse|ls-files|blame`. The flags `--output`, `--ext-diff`,
  `--textconv`, `-o`, `-c`, `--config-env` are rejected (`:43-59`).
- `verify` mode: the above plus `pnpm -C <server|client|e2e>
  typecheck|test|lint` (also via `npx --yes pnpm@10`), targeted
  `pnpm -C <server|client> exec vitest run <path>`, and
  `npm --prefix reviewer-core test|run typecheck` (`:46-51`).

This script does not read `CLAUDE_PROJECT_DIR`. Only `test-writer-guard.sh`
and `doc-writer-guard.sh` fail closed when it is unset. `planner-guard.sh`
falls back to `git rev-parse`.

## Known limitations

- `implementer-guard.sh` fails open: if the Python parse fails, `tool` and
  `target` are empty, no `case` branch matches, and the script exits 0
  (`.claude/hooks/implementer-guard.sh:7-14,37-38`).
- `implementer-guard.sh` does not catch `cp` or `mv` onto a protected path;
  only `sed -i`, `>`, `>>` and `tee` are checked (`:33`).
- `test-writer-guard.sh` does not catch `cp`, `mv`, `python -c` or `node -e`
  writes, since only `sed -i`, `tee` and `>` are matched
  (`.claude/hooks/test-writer-guard.sh:64-71`).
- `planner-guard.sh` blocks on a parse error only by accident: a failed parse
  leaves `target` empty, which simply fails the path regex
  (`.claude/hooks/planner-guard.sh:7-20`). There is no explicit fail-closed
  branch.
- Guards are frontmatter-scoped: they protect only the agent that declares
  them, not the main session.
