#!/bin/bash
# PreToolUse guard for the `spec-creator` agent (wired in its frontmatter, so it does not affect other sessions).
# spec-creator may Write/Edit only <repo>/specs/YYYY-MM-DD-<feature>.md (cross-module) or <repo>/<package>/specs/YYYY-MM-DD-<feature>.md for the 5 packages (date-prefixed, kebab-case, not README.md).
# Exit 2 = block (stderr is shown to the agent). Exit 0 = allow. Fails closed on unparsable input.

input=$(cat)
target=$(printf '%s' "$input" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print(((d.get("tool_input", {}) or {}).get("file_path", "")).replace("\n", " "))
' 2>/dev/null)

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"

if [ -n "$root" ] && printf '%s' "$target" | grep -qE "^${root}/((server|client|reviewer-core|e2e|mcp)/)?specs/[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9][a-z0-9-]*\.md$" \
  && [ "$(basename "$target")" != "README.md" ]; then
  exit 0
fi

echo "spec-creator-guard: spec-creator may only write specs/YYYY-MM-DD-<kebab-case>.md or <server|client|reviewer-core|e2e|mcp>/specs/YYYY-MM-DD-<kebab-case>.md (not README.md). Refused: '$target'" >&2
exit 2
