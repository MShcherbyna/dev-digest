#!/bin/bash
# PreToolUse guard for the `planner` agent (wired in its frontmatter, so it does not affect other sessions).
# The planner may Write only the plan files: <repo>/docs/plans/<feature>_en.md and <repo>/docs/plans/<feature>_uk.md.
# Exit 2 = block (stderr is shown to the agent). Exit 0 = allow.

input=$(cat)
target=$(printf '%s' "$input" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print(((d.get("tool_input", {}) or {}).get("file_path", "")).replace("\n", " "))
' 2>/dev/null)

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"

if printf '%s' "$target" | grep -qE "^${root}/docs/plans/[a-z0-9][a-z0-9-]*_(en|uk)\.md$"; then
  exit 0
fi

echo "planner-guard: planner may only write docs/plans/<feature>_en.md and docs/plans/<feature>_uk.md (kebab-case feature name). Refused: '$target'" >&2
exit 2
