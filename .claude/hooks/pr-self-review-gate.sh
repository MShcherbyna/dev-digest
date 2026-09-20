#!/bin/bash
# PreToolUse (Bash) gate: refuse `git push` / `gh pr create` unless a fresh, non-BLOCKED
# pr-self-review report exists for the current HEAD.
# Exit 2 = block (message on stderr is shown to Claude). Exit 0 = allow.
# Only guards Bash calls made by Claude Code; it does not affect pushes from a terminal/IDE.
# Emergency override: PR_SELF_REVIEW_SKIP=1 (logged to .claude/pr-self-review/skips.log).

input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)

# Only gate real invocations at the start of a command segment (not text inside e.g. a commit message).
if ! printf '%s' "$cmd" | grep -qE '(^|[;&|(]|&&|\|\|)[[:space:]]*(git[[:space:]]+(-[^[:space:]]+[[:space:]]+([^-[:space:]][^[:space:]]*[[:space:]]+)?)*push|gh[[:space:]]+pr[[:space:]]+(create|merge))([[:space:]]|$)'; then
  exit 0
fi

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
report="$root/.claude/pr-self-review/last-report.json"

if [ "${PR_SELF_REVIEW_SKIP:-}" = "1" ] || printf '%s' "$cmd" | grep -q 'PR_SELF_REVIEW_SKIP=1'; then
  mkdir -p "$root/.claude/pr-self-review"
  echo "$(date -u +%FT%TZ) skip: $cmd" >> "$root/.claude/pr-self-review/skips.log"
  exit 0
fi

block() { echo "pr-self-review: $1" >&2; exit 2; }

[ -f "$report" ] || block "no report found. Run the pr-self-review skill (/pr-self-review) before pushing or opening a PR."

read -r verdict crit rhead < <(python3 - "$report" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
print(r.get("verdict", "?"), r.get("critical_count", 0), r.get("head_sha", ""))
PY
)
head=$(git -C "$root" rev-parse HEAD)

# For a merge the reviewed commit must be the PR's head, which is not necessarily the checked-out HEAD.
if printf '%s' "$cmd" | grep -qE 'gh[[:space:]]+pr[[:space:]]+merge'; then
  sel=$(printf '%s' "$cmd" | sed -E 's/.*gh[[:space:]]+pr[[:space:]]+merge//' | tr -s ' ' '\n' | grep -vE '^(-|$)' | head -1)
  pr_head=""
  command -v gh >/dev/null 2>&1 && pr_head=$(cd "$root" && gh pr view $sel --json headRefOid -q .headRefOid 2>/dev/null)
  if [ -n "$pr_head" ]; then
    head="$pr_head"
  else
    branch=$(git -C "$root" rev-parse --abbrev-ref HEAD)
    case "$branch" in
      main|master) block "cannot tell which commit this PR merges (gh unavailable and you are on $branch). Check out the PR branch, run /pr-self-review, then merge." ;;
    esac
  fi
fi

[ "$rhead" = "$head" ] || block "report is stale (reviewed ${rhead:0:7}, target commit is ${head:0:7}). Re-run /pr-self-review."
if [ "$verdict" != "PASS" ] || [ "${crit:-0}" -gt 0 ]; then
  block "verdict $verdict with $crit critical finding(s). Fix them or add a justified waiver, then re-run /pr-self-review. See .claude/pr-self-review/last-report.json."
fi
exit 0
