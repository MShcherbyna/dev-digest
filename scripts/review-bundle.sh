#!/bin/bash
# Collect the working-tree change (tracked diff + untracked files) into ONE markdown file,
# so the reviewer agents read a single bundle instead of each re-running git diff and
# re-reading every file. Deterministic, read-only on the repo, no LLM.
# Usage: scripts/review-bundle.sh <out-file> [base-ref]     (default base: HEAD)
set -u

out="${1:-}"
base="${2:-HEAD}"
[ -n "$out" ] || { echo "usage: $0 <out-file> [base-ref]" >&2; exit 1; }

cd "$(git rev-parse --show-toplevel)" || exit 1

MAX_FILE_LINES=400     # per untracked file
MAX_DIFF_LINES=6000    # tracked diff
# Noise that is never review input.
EXCLUDES=(
  ':(exclude).playwright-mcp'
  ':(exclude)scripts/.playwright-mcp'
  ':(exclude)design'
  ':(exclude)docs/plans'
  ':(exclude)*pnpm-lock.yaml'
  ':(exclude)*/db/migrations/meta/*.json'
)

{
  echo "# Review bundle"
  echo
  echo "- base: \`$base\` ($(git rev-parse --short "$base"))"
  echo "- branch: \`$(git rev-parse --abbrev-ref HEAD)\`"
  echo "- generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "- excluded noise: .playwright-mcp, design/, docs/plans, lockfiles, migration snapshots"
  echo "- caps: ${MAX_DIFF_LINES} diff lines, ${MAX_FILE_LINES} lines per untracked file; when a marker says truncated, open the file"
  echo
  echo "## git status (porcelain)"
  echo '```'
  git status --porcelain --untracked-files=all -- . "${EXCLUDES[@]}"
  echo '```'
  echo
  echo "## Tracked changes: diff --stat"
  echo '```'
  git diff --stat "$base" -- . "${EXCLUDES[@]}"
  echo '```'
  echo
  echo "## Tracked changes: diff"
  echo '```diff'
  git diff "$base" -- . "${EXCLUDES[@]}" | head -n "$MAX_DIFF_LINES"
  total=$(git diff "$base" -- . "${EXCLUDES[@]}" | wc -l | tr -d ' ')
  [ "$total" -gt "$MAX_DIFF_LINES" ] && echo "... TRUNCATED: $total diff lines, showing $MAX_DIFF_LINES"
  echo '```'
  echo
  echo "## Untracked files (full content, capped)"
  git ls-files --others --exclude-standard -- . "${EXCLUDES[@]}" | while IFS= read -r f; do
    [ -f "$f" ] || continue
    # Skip binaries.
    if ! grep -Iq . "$f" 2>/dev/null; then echo; echo "### $f (binary or empty, skipped)"; continue; fi
    n=$(wc -l < "$f" | tr -d ' ')
    echo
    echo "### $f ($n lines)"
    echo '```'
    head -n "$MAX_FILE_LINES" "$f"
    [ "$n" -gt "$MAX_FILE_LINES" ] && echo "... TRUNCATED: $n lines, showing $MAX_FILE_LINES"
    echo '```'
  done
} > "$out"

echo "wrote $out ($(wc -c < "$out" | tr -d ' ') bytes, $(wc -l < "$out" | tr -d ' ') lines)"
