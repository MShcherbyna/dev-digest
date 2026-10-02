# Insights — mcp/

Durable findings discovered while working in this package that aren't
obvious from the code or `README.md`. Append-only: correct a stale entry
with a dated note beneath it rather than editing it away. Sections are
fixed — add to the one that fits, never invent a new heading. Written and
read by the `engineering-insights` skill.

## Decisions

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

- **2026-10-02** — `@modelcontextprotocol/sdk` 1.31.0 does NOT raise invalid
  tool arguments as JSON-RPC errors: the `CallTool` handler wraps everything
  (bad args, unknown tool, output-schema mismatch) in a try/catch and returns
  `{isError:true, content:[text]}`; `outputSchema` validation is skipped when
  `isError` is true. So "protocol error vs business error" is not distinguishable
  by a client on this version; `src/server.test.ts` flow 5 pins the behaviour.
  The text is SDK-generated ("Input validation error: ..."), not our four-part
  recovery format, which applies to business errors only. Accepted by the user
  2026-10-02 (no switch to the low-level `Server`).
  `grep -n "createToolError" mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js`.
- **2026-10-02** — Claude Code's docs (https://code.claude.com/docs/en/mcp)
  never state the cwd of a stdio server; they say `CLAUDE_PROJECT_DIR` is set in
  the server's env and that `${CLAUDE_PROJECT_DIR:-.}` is the supported way to
  reference it in `.mcp.json` `command`/`args`. Resolution: the root `.mcp.json`
  now uses `${CLAUDE_PROJECT_DIR:-.}/mcp/...` (falls back to cwd; smoke-tested
  from the repo root with `StdioClientTransport`).

## Recurring Errors & Fixes

## Session Notes

## Open Questions
