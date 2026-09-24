#!/bin/bash
# PreToolUse guard for the `doc-writer` agent (wired in its frontmatter, so it does not affect other sessions).
# Allows Edit|Write only on documentation markdown under $CLAUDE_PROJECT_DIR:
#   <pkg>/docs/<topic>.md, <pkg>/README.md, server/src/modules/<name>/README.md,
#   README.md (root), docs/<section>/<topic>.md (section != plans).
# Always blocks: docs/plans/, INSIGHTS.md, CLAUDE.md, AGENTS.md (CLAUDE.md is a symlink to
# AGENTS.md in every package, so editing AGENTS.md edits agent instructions), */specs/**,
# .claude/**, and vendored / generated / lockfile paths.
# Fails CLOSED: unparseable input, unknown tool, or missing project dir => exit 2.
# Exit 2 = block (stderr is shown to the agent). Exit 0 = allow.

python3 -c '
import json, os, re, sys

def block(msg):
    sys.stderr.write("doc-writer-guard: " + msg + "\n")
    sys.exit(2)

try:
    d = json.load(sys.stdin)
    if not isinstance(d, dict):
        raise ValueError("not an object")
    tool = d.get("tool_name")
    ti = d.get("tool_input")
    if not isinstance(ti, dict):
        raise ValueError("no tool_input")
except Exception:
    block("cannot parse hook input; blocking (fail closed).")

if tool not in ("Edit", "Write"):
    block("tool %r is not allowed for doc-writer (only Edit|Write)." % (tool,))

path = ti.get("file_path")
if not isinstance(path, str) or not path or "\0" in path or "\n" in path:
    block("missing or invalid file_path.")

proj = os.environ.get("CLAUDE_PROJECT_DIR", "")
if not proj or not os.path.isabs(proj):
    block("CLAUDE_PROJECT_DIR is not set; blocking (fail closed).")
if not os.path.isabs(path):
    block("file_path must be absolute.")

root = os.path.realpath(proj)
real = os.path.realpath(path)  # resolves symlinks and ".." (also for not-yet-existing files)
if not real.startswith(root + os.sep):
    block("%r resolves outside the project." % path)
rel = real[len(root) + 1:]
# Also check the lexical relative path, so a symlink cannot smuggle a blocked name past us.
lex = os.path.normpath(path)
lex_rel = lex[len(os.path.normpath(proj)) + 1:] if lex.startswith(os.path.normpath(proj) + os.sep) else rel

protected = re.compile(r"(/vendor/shared/|client/src/vendor/ui/|server/src/db/migrations/|pnpm-lock\.yaml)")
denied = [
    (re.compile(r"^docs/plans/"), "docs/plans/ is owned by the planner agent"),
    (re.compile(r"(^|/)INSIGHTS\.md$"), "INSIGHTS.md is not written by doc-writer (suggest promotions in the report)"),
    (re.compile(r"(^|/)CLAUDE\.md$"), "CLAUDE.md is agent instructions"),
    (re.compile(r"(^|/)AGENTS\.md$"), "AGENTS.md is the CLAUDE.md symlink target (agent instructions); propose Read-when links in the report instead"),
    (re.compile(r"(^|/)specs/"), "specs/ is not written by doc-writer"),
    (re.compile(r"^\.claude/"), ".claude/ is not writable by doc-writer"),
]
for candidate in (rel, lex_rel):
    if protected.search("/" + candidate):
        block("%r is do-not-touch (vendored, generated, or lockfile)." % path)
    for rx, why in denied:
        if rx.search(candidate):
            block("%r is blocked: %s." % (path, why))

allowed = [
    r"^(server|client|reviewer-core|e2e)/docs/[a-z0-9][a-z0-9-]*\.md$",
    r"^(server|client|reviewer-core|e2e)/README\.md$",
    r"^server/src/modules/[a-z0-9-]+/README\.md$",
    r"^README\.md$",
    r"^docs/[a-z0-9-]+/[a-z0-9][a-z0-9-]*\.md$",  # docs/plans/ already denied above
]
if rel == lex_rel and any(re.match(a, rel) for a in allowed):
    sys.exit(0)
block("%r is not on the documentation allowlist (package docs/<topic>.md, package README.md, server module README.md, root README.md, docs/<section>/<topic>.md)." % path)
'
rc=$?
# python exits 2 on block; anything other than 0 (including python missing/crash) blocks.
[ "$rc" -eq 0 ] && exit 0
exit 2
