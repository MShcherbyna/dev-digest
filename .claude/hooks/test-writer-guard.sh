#!/bin/bash
# PreToolUse guard for the `test-writer` agent (wired in its frontmatter, so it does not affect other sessions).
# Edit|Write: allowed only for test files, shared test helpers and INSIGHTS.md (never do-not-touch paths).
# Bash: blocks git commit/push, db:migrate, dependency changes (lockfiles), and shell writes (sed -i, tee, redirection).
# FAILS CLOSED: unparsable input, unknown tool, or missing CLAUDE_PROJECT_DIR => exit 2.
# Exit 2 = block (stderr is shown to the agent). Exit 0 = allow.

input=$(cat)
printf '%s' "$input" | python3 -c '
import json, os, re, sys

def block(msg):
    sys.stderr.write("test-writer-guard: " + msg + "\n")
    sys.exit(2)

try:
    d = json.loads(sys.stdin.read())
    tool = d["tool_name"]
    ti = d.get("tool_input") or {}
    if not isinstance(tool, str) or not isinstance(ti, dict):
        raise ValueError("bad shape")
except Exception:
    block("could not parse hook input; blocking (fail closed).")

protected = re.compile(r"(/vendor/shared/|client/src/vendor/ui/|server/src/db/migrations/|pnpm-lock\.yaml)")

if tool in ("Edit", "Write"):
    fp = ti.get("file_path")
    if not isinstance(fp, str) or not fp:
        block("missing file_path; blocking (fail closed).")
    root = os.environ.get("CLAUDE_PROJECT_DIR", "")
    if not root:
        block("CLAUDE_PROJECT_DIR is not set; blocking (fail closed).")
    root = os.path.normpath(root)
    path = os.path.normpath(fp)  # collapses ../ so traversal cannot dodge the patterns
    if not path.startswith(root + os.sep):
        block("'%s' is outside the project; blocked." % fp)
    rel = path[len(root) + 1:]
    if protected.search("/" + rel):
        block("'%s' is do-not-touch (vendored, drizzle-kit generated, or lockfile)." % fp)
    allowed = [
        r"^(client|server|reviewer-core)/.*\.test\.tsx?$",
        r"^client/src/test/[^/]+\.tsx?$",
        r"^server/test/helpers/[^/]+\.ts$",
        r"^((client|server|reviewer-core|e2e)/)?INSIGHTS\.md$",
    ]
    if not any(re.search(p, rel) for p in allowed):
        block("'%s' is not a test file, test helper or INSIGHTS.md. test-writer never edits production code; report a suspected defect instead." % rel)
    sys.exit(0)

if tool == "Bash":
    cmd = ti.get("command")
    if not isinstance(cmd, str) or not cmd.strip():
        block("missing command; blocking (fail closed).")
    flat = cmd.replace("\n", " ")
    if re.search(r"(^|[;&|(]|&&|\|\|)\s*git\s+(-\S+\s+)*(commit|push)(\s|$)", flat):
        block("test-writer does not commit or push. Report the changes; the user commits.")
    if "db:migrate" in flat:
        block("DB migrations are run manually by the user.")
    if re.search(r"\b(pnpm|npm|yarn)\b(\s+\S+)*\s+(add|install|i|remove|rm|uninstall|update|up|dedupe|link)(\s|$)", flat):
        block("dependency changes are blocked (they touch lockfiles). Report the missing capability under Not covered.")
    if re.search(r"\bnpx\b.*\bpnpm@\S+.*\s(add|install|i|remove|rm|uninstall|update|up|dedupe|link)(\s|$)", flat):
        block("dependency changes are blocked (they touch lockfiles).")
    if protected.search(flat) and re.search(r"(sed\s+-\S*i|>|tee)", flat):
        block("shell write to a do-not-touch path is blocked.")
    if re.search(r"\bsed\s+(-\S+\s+)*-\S*i|\bsed\s+--in-place|\btee\b", flat):
        block("sed -i / tee are blocked; use the Edit or Write tool on test files.")
    # redirection: ignore harmless fd merges / /dev/null sinks, block everything else
    stripped = re.sub(r"\d*>&\d+|\d*>>?\s*/dev/null", "", flat)
    if ">" in stripped:
        block("shell redirection is blocked; use the Edit or Write tool on test files.")
    sys.exit(0)

block("tool '%s' is not handled by this guard; blocking (fail closed)." % tool)
'
exit $?
