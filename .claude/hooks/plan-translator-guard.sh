#!/bin/bash
# PreToolUse guard for the `plan-translator` agent (wired in its frontmatter, so it does not affect other sessions).
# The translator may Write only <repo>/docs/plans/<feature>_uk.md (kebab-case feature name).
# Fails CLOSED: unparseable input, non-Write tool, or missing project dir => exit 2.
# Exit 2 = block (stderr is shown to the agent). Exit 0 = allow.

python3 -c '
import json, os, re, sys

def block(msg):
    sys.stderr.write("plan-translator-guard: " + msg + "\n")
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

if tool != "Write":
    block("tool %r is not allowed for plan-translator (only Write)." % (tool,))

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
lex = os.path.normpath(path)
lex_rel = lex[len(os.path.normpath(proj)) + 1:] if lex.startswith(os.path.normpath(proj) + os.sep) else rel

if rel == lex_rel and re.fullmatch(r"docs/plans/[a-z0-9][a-z0-9-]*_uk\.md", rel):
    sys.exit(0)
block("%r is not allowed: plan-translator may only write docs/plans/<feature>_uk.md." % path)
'
rc=$?
[ "$rc" -eq 0 ] && exit 0
exit 2
