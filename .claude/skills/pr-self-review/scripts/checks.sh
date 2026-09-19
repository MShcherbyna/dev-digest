#!/bin/bash
# Usage: checks.sh <base_sha> [--skip-tests]
# Deterministic pre-PR checks over committed changes (<base_sha>...HEAD).
# Prints a JSON array of findings on stdout; progress goes to stderr.
set -u
BASE="${1:?usage: checks.sh <base_sha> [--skip-tests]}"
SKIP_TESTS=0
[ "${2:-}" = "--skip-tests" ] && SKIP_TESTS=1

cd "$(git rev-parse --show-toplevel)" || exit 1
OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

# add <severity> <rule> <file> <line> <message>
add() { printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$5" >> "$OUT"; }

# Changed files that still exist at HEAD (deleted files are not linted), and all changed incl. deleted.
CHANGED_ALL=$(git diff --name-only "$BASE"...HEAD)
CHANGED=$(git diff --name-only --diff-filter=d "$BASE"...HEAD)

# grep_head <regex> <file> -> "line:text" lines from the committed version of the file
grep_head() { git show "HEAD:$2" 2>/dev/null | grep -nE "$1"; }

# --- 1. Do-not-touch paths -------------------------------------------------
# Lockfile: legit when its package.json changed too (pnpm install). Migrations: legit only when
# newly added alongside a schema change (drizzle-kit). vendor/shared: judged by drift (check 3).
ADDED=$(git diff --name-only --diff-filter=A "$BASE"...HEAD)
SCHEMA_CHANGED=0
echo "$CHANGED_ALL" | grep -qE '^server/src/db/schema(\.ts|/)' && SCHEMA_CHANGED=1
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    */pnpm-lock.yaml)
      echo "$CHANGED_ALL" | grep -qx "${f%/pnpm-lock.yaml}/package.json" ||
        add critical det/do-not-touch "$f" 0 "Lockfile changed but its package.json did not; regenerate via pnpm install, never edit by hand." ;;
    client/src/vendor/ui/*)
      add critical det/do-not-touch "$f" 0 "Vendored UI edited in place (Do-not-touch). Change it at the sync source." ;;
    server/src/db/migrations/*)
      if ! echo "$ADDED" | grep -qx "$f"; then
        add critical det/do-not-touch "$f" 0 "Existing migration/snapshot modified or removed; generate a new one with pnpm db:generate."
      elif [ "$SCHEMA_CHANGED" -eq 0 ]; then
        add major det/do-not-touch "$f" 0 "Migration added without a schema change; migrations must come from drizzle-kit."
      fi ;;
  esac
done <<< "$CHANGED_ALL"

# --- 2. Schema changed without a new migration ----------------------------
if [ "$SCHEMA_CHANGED" -eq 1 ]; then
  echo "$ADDED" | grep -q '^server/src/db/migrations/.*\.sql$' ||
    add critical det/schema-no-migration server/src/db/schema.ts 0 "Schema changed but no new migration was added. Run pnpm db:generate in server/."
fi

# --- 3. Vendored shared copies: no drift introduced by this branch ----------
# Pre-existing drift on main is not this PR's fault, so only check when the branch touches vendor/shared.
if echo "$CHANGED_ALL" | grep -q '/vendor/shared/' && [ -d server/src/vendor/shared ] && [ -d client/src/vendor/shared ]; then
  if ! diff -rq server/src/vendor/shared client/src/vendor/shared >/dev/null 2>&1; then
    add critical det/vendor-drift server/src/vendor/shared 0 "vendor/shared was edited and the server/client copies now differ; they must stay identical and be synced from the source."
  fi
fi

# --- 4. Layer boundaries (server modules) ----------------------------------
INFRA_RE="from ['\"](fastify|drizzle-orm|postgres|@octokit/[^'\"]*|octokit|openai|@anthropic-ai/sdk)"
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    server/src/modules/*/routes.ts)
      grep_head "from ['\"]\./repository" "$f" | while IFS=: read -r ln rest; do
        add critical det/layer-route-repo "$f" "$ln" "Route imports repository directly; routes call one service method only."
      done ;;
    server/src/modules/*/service.ts|server/src/modules/*/ports.ts|server/src/modules/*/domain/*)
      grep_head "$INFRA_RE" "$f" | while IFS=: read -r ln rest; do
        add critical det/layer-service-infra "$f" "$ln" "Application/domain layer imports infrastructure (${rest# }). Depend on a port instead."
      done ;;
  esac
  case "$f" in
    client/*)
      grep_head "from ['\"](\.\./)*server/|from ['\"]@devdigest/api" "$f" | while IFS=: read -r ln rest; do
        add critical det/client-imports-server "$f" "$ln" "Client code imports from server/. Share contracts via vendor/shared only."
      done ;;
  esac
done <<< "$CHANGED"

# --- 5. PR size ------------------------------------------------------------
N=$(echo "$CHANGED_ALL" | grep -c .)
[ "$N" -gt 40 ] && add minor det/pr-size "" 0 "PR touches $N files (>40). Consider splitting it."

# --- 6. Typecheck / test / lint per touched package ------------------------
run_pkg() { # <pkg> <script> <rule> <label>
  local pkg="$1" script="$2" rule="$3" label="$4" log
  [ -d "$pkg/node_modules" ] || { add major det/skipped "$pkg/package.json" 0 "$pkg has no node_modules; $label not run. Run pnpm install there."; return; }
  grep -q "\"$script\"" "$pkg/package.json" || return
  echo "[checks] $pkg: pnpm $script" >&2
  log=$(cd "$pkg" && pnpm "$script" 2>&1) || add "${5:-critical}" "$rule" "$pkg/package.json" 0 "pnpm $script failed in $pkg: $(echo "$log" | tail -n 8 | tr '\n\t' '  ' | cut -c1-500)"
}
for pkg in server client reviewer-core e2e; do
  echo "$CHANGED_ALL" | grep -q "^$pkg/" || continue
  # only source/config changes matter for validation
  echo "$CHANGED_ALL" | grep -E "^$pkg/" | grep -qvE '\.md$|/specs/|/docs/' || continue
  [ -f "$pkg/package.json" ] || continue
  run_pkg "$pkg" typecheck det/typecheck typecheck
  [ "$pkg" = client ] && run_pkg "$pkg" lint det/lint lint major
  [ "$SKIP_TESTS" -eq 0 ] && run_pkg "$pkg" test det/tests tests
done

# --- 7. Missing co-located tests (major) -----------------------------------
while IFS= read -r f; do
  case "$f" in
    server/src/modules/*/service.ts|server/src/modules/*/repository.ts) ;;
    client/src/*/_components/*/*.tsx) ;;
    *) continue ;;
  esac
  case "$f" in *.test.*) continue ;; esac
  base="${f%.*}"
  ls "$base".test.* "$base".it.test.* >/dev/null 2>&1 && continue
  ls "$(dirname "$f")"/*.test.* "$(dirname "$f")"/*.it.test.* >/dev/null 2>&1 && continue
  add major det/no-test "$f" 1 "Changed source file has no co-located test."
done <<< "$CHANGED"

python3 - "$OUT" <<'PY'
import json, sys
out = []
for line in open(sys.argv[1]):
    sev, rule, f, ln, msg = line.rstrip("\n").split("\t", 4)
    out.append({"severity": sev, "skill": "deterministic", "rule": rule, "file": f,
                "line": int(ln), "message": msg, "suggestion": "", "source": "deterministic"})
print(json.dumps(out, indent=2))
PY
