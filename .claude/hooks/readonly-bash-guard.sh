#!/bin/bash
# PreToolUse(Bash) allowlist guard for the read-only agents (wired in their
# frontmatter, so it does not affect other sessions).
# Usage: readonly-bash-guard.sh <git|verify>
#   git    -> architecture-reviewer: read-only git subcommands only.
#   verify -> plan-verifier: everything `git` allows, plus typecheck/test/lint
#             runs (pnpm per package, targeted vitest, reviewer-core npm test).
# Fails CLOSED: unparseable input, unknown mode or non-Bash tool => exit 2.
# The command is attacker-controlled text: shell metacharacters are rejected
# first, then the command must fully match an anchored allowlist regex.
# Exit 2 = block (stderr is shown to the agent). Exit 0 = allow.

mode="$1"
input=$(cat)

printf '%s' "$input" | GUARD_MODE="$mode" python3 -c '
import json, os, re, sys

mode = os.environ.get("GUARD_MODE", "")

def block(msg):
    sys.stderr.write("readonly-bash-guard(%s): %s\n" % (mode or "?", msg))
    sys.exit(2)

if mode not in ("git", "verify"):
    block("unknown mode (expected git|verify).")

try:
    d = json.load(sys.stdin)
    tool = d["tool_name"]
    cmd = d["tool_input"]["command"]
except Exception:
    block("could not parse hook input; blocking (fail closed).")

if tool != "Bash" or not isinstance(cmd, str) or not cmd.strip():
    block("only a non-empty Bash command is allowed.")

# Single command only: no chaining, redirection, substitution, expansion.
if re.search(r"[\n\r;&|<>`$\\]", cmd):
    block("\x27%s\x27 contains a shell metacharacter (newline ; & | < > ` $ \\); "
          "run one plain command per call." % cmd)

GIT = re.compile(
    r"git( -C [^ ]+)? (diff|status|log|show|merge-base|rev-parse|ls-files|blame)( [^ ].*)?"
)
VERIFY = [
    re.compile(r"(npx --yes pnpm@10|pnpm) -C (server|client|e2e) (typecheck|test|lint)"),
    re.compile(r"(npx --yes pnpm@10|pnpm) -C (server|client) exec vitest run "
               r"[A-Za-z0-9_./\[\]@-]+( --exclude [^ ]+)?"),
    re.compile(r"npm --prefix reviewer-core (test|run typecheck)"),
]

if GIT.fullmatch(cmd):
    # Flags that write files or run programs; -c would inject git config
    # (pager, alias, external diff), so it is rejected anywhere as a token.
    if re.search(r"(^| )(--output|--ext-diff|--textconv|-o|-c|--config-env)([= ]|$)", cmd):
        block("\x27%s\x27 uses a flag that writes files, runs programs or "
              "injects git config (--output, --ext-diff, --textconv, -o, -c)." % cmd)
    sys.exit(0)

if mode == "verify" and any(p.fullmatch(cmd) for p in VERIFY):
    sys.exit(0)

block("\x27%s\x27 is not on the read-only allowlist. Allowed: git "
      "diff|status|log|show|merge-base|rev-parse|ls-files|blame%s."
      % (cmd, "; pnpm -C <server|client|e2e> typecheck|test|lint; targeted "
              "vitest run; npm --prefix reviewer-core test" if mode == "verify" else ""))
'
exit $?
