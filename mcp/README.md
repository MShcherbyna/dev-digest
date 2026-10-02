# @devdigest/mcp

Local **stdio** MCP server that lets Claude Code (and other MCP clients) drive
DevDigest. It is a thin layer over the running DevDigest API
(`http://localhost:3001` by default), so start the stack first
(`./scripts/dev.sh`). It holds no secrets and no DB credentials.

## Setup

```sh
cd mcp && npx --yes pnpm@10 install
```

The repo-root `.mcp.json` registers it for Claude Code (project scope). Start
`claude` at the repo root and approve the `devdigest` server; `/mcp` should list
it with 5 tools. `.mcp.json` locates the server via `${CLAUDE_PROJECT_DIR:-.}`
because Claude Code's docs do not specify a stdio server's working directory.
The server starts even when the API is down; each tool call
then returns an actionable error.

## Tools

| Tool | What it does |
|---|---|
| `list_agents` | Reviewer agents (name, slug, model, enabled). Never returns system prompts. |
| `run_agent_on_pr` | Runs ONE agent on a PR (`repo` "owner/name", `pr` number, `agent` name/slug/id), waits up to the wait budget, returns `{verdict, findings[]}`. |
| `get_findings` | Verdict + findings of a run (latest by default), paginated (`limit`, `cursor`). |
| `get_conventions` | A repo's extracted conventions, paginated. |
| `get_blast_radius` | Stub: always `{status:"not_implemented", message}`. |

Behaviour worth knowing:

- A run still going after the wait returns `status:"running"` (not an error)
  plus `run_id` and `next_step`; call `get_findings` later. Cancelling the call
  stops polling but **does not cancel the server-side run** (it is still billed).
- An already-running review of the same agent on the same PR is reused
  (in-flight dedupe), not started twice. Finished runs are never reused.
- Guard: at most 5 run starts per 10 minutes per MCP session.
- Finding/convention text is untrusted PR/LLM content; it is returned as data
  (control chars and ANSI stripped, truncated), never filtered by keyword.
- Responses are capped at ~16 000 characters; use `cursor` for more.
- PR lookup uses `GET /repos/:id/pulls`, which syncs from GitHub as a side effect
  (can take seconds the first time; cached per session).
- `get_findings` without `run_id` reads the newest run with status `done`
  (filtered by `agent` if given). Only when no run is done does it fall back to
  the newest run of any status, so a `running`, `failed` or `cancelled` run is
  still reported. A newer failed run never masks an older finished one. Pass
  `run_id` to read a specific run.
- `get_findings` and `get_conventions` are marked read-only; resolving a PR may
  trigger a GitHub sync (cache refresh) on the API side.
- Error model: **business errors** (unknown repo/agent/PR, run limit, failed run,
  API down) use the four-part recovery format ("what / Expected / Example / Next")
  with `isError: true`. **Invalid arguments** (wrong type, nested object, unknown
  tool) are NOT JSON-RPC errors in the pinned SDK (1.31.0): they come back as
  `isError: true` results with SDK-generated text ("Input validation error: ..."),
  not in our four-part format.
- Shutdown (stdin EOF, SIGINT, SIGTERM) waits up to 5 s for in-flight tool calls
  to finish and flush before exiting.

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | Must be loopback (localhost, 127.0.0.1, ::1); anything else exits 1. |
| `DEVDIGEST_WEB_URL` | `http://localhost:3000` | Used for `web_url` in results. |
| `DEVDIGEST_MCP_HTTP_TIMEOUT_MS` | 10000 | Per API call. |
| `DEVDIGEST_MCP_RESOLVE_TIMEOUT_MS` | 30000 | PR lookup (GitHub sync). |
| `DEVDIGEST_MCP_RUN_WAIT_MS` | 120000 | Max wait in `run_agent_on_pr` (max 600000). Independent of Claude Code's own tool timeout. |
| `DEVDIGEST_MCP_POLL_MS` | 3000 | Run status poll interval. |
| `DEVDIGEST_MCP_MAX_RUNS` / `DEVDIGEST_MCP_RUN_WINDOW_MS` | 5 / 600000 | Run-start cap per window. |
| `DEVDIGEST_MCP_LOG_LEVEL` | info | stderr only. |

No secret is read or logged. LLM keys stay in the API's own secrets file.

## Permissions and cost

`run_agent_on_pr` spends LLM money. Read tools (`list_agents`, `get_findings`,
`get_conventions`, `get_blast_radius`) may be allow-listed in Claude Code
permissions; keep the per-call prompt for `mcp__devdigest__run_agent_on_pr`
(human in the loop).

## Development

```sh
npx --yes pnpm@10 typecheck
npx --yes pnpm@10 test
```

stdout carries only JSON-RPC; logs go to stderr (`claude --debug` shows them).
`src/main.test.ts` spawns the real entrypoint over stdio, so stray stdout output
fails it.

## Measured startup cost

Not measured yet. After the first Claude Code session, run `/context` and record
the `devdigest` MCP tools line here.
