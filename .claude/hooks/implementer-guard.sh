#!/bin/bash
# PreToolUse guard for the `implementer` agent (wired in its frontmatter, so it does not affect other sessions).
# Blocks: edits to do-not-touch paths, and git commit/push/db:migrate via Bash.
# Exit 2 = block (stderr is shown to the agent). Exit 0 = allow.

input=$(cat)
read -r tool target < <(printf '%s' "$input" | python3 -c '
import json, sys
d = json.load(sys.stdin)
ti = d.get("tool_input", {}) or {}
t = d.get("tool_name", "")
v = ti.get("command", "") if t == "Bash" else ti.get("file_path", "")
print(t, v.replace("\n", " "))
' 2>/dev/null)

block() { echo "implementer-guard: $1" >&2; exit 2; }

protected='(/vendor/shared/|client/src/vendor/ui/|server/src/db/migrations/|pnpm-lock\.yaml)'

case "$tool" in
  Edit|Write)
    if printf '%s' "$target" | grep -qE "$protected"; then
      block "'$target' is do-not-touch (vendored, drizzle-kit generated, or lockfile). Edit at the source / regenerate with the package tooling, or report it as a deviation."
    fi
    ;;
  Bash)
    if printf '%s' "$target" | grep -qE '(^|[;&|(]|&&|\|\|)[[:space:]]*git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*(commit|push)([[:space:]]|$)'; then
      block "implementer does not commit or push. Report the changes; the user commits (branch-name prefix)."
    fi
    if printf '%s' "$target" | grep -qE 'db:migrate'; then
      block "DB migrations are run manually by the user. Report that 'pnpm db:migrate' is needed."
    fi
    if printf '%s' "$target" | grep -qE "(sed[[:space:]]+-i|>>?|tee)[^|;&]*$protected"; then
      block "shell write to a do-not-touch path is blocked."
    fi
    ;;
esac
exit 0
