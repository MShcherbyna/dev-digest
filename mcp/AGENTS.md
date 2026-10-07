# mcp/ — @devdigest/mcp

Local stdio MCP server (`devdigest-mcp`) exposing five tools to Claude Code.
A thin layer over the **running** DevDigest Fastify API — no DB, no secrets,
no server imports. Read [../AGENTS.md](../AGENTS.md) for the repo-wide picture.

## Read when

- Setup, env vars, the 5 tools, cost/permissions guidance: read [README.md](README.md).
- Past gotchas and decisions: read [INSIGHTS.md](INSIGHTS.md).
- Design rationale and decisions: read [../docs/plans/mcp-server_en.md](../docs/plans/mcp-server_en.md).

## Non-default conventions

- **stdout is protocol-only.** Never `console.log` / `process.stdout.write`;
  logging goes through `src/lib/logger.ts` (stderr). `main.ts` reroutes stray
  `console.*` to stderr as defence in depth.
- Layering: `main.ts` (composition root) → `server.ts` → `tools/*` (depend only
  on the `DevDigestGateway` port) → `gateway/http-gateway.ts` (the only `fetch`).
- Every tool handler goes through `safeHandler` — no exception escapes.
- Tool set is closed (5 tools), flat scalar args only, snake_case names.
- API responses are `safeParse`d against the minimal schemas in
  `src/gateway/api-schemas.ts`; do not vendor `@devdigest/shared` here. A schema that
  mirrors a server-local response (`ApiBlastRadius` ↔ `server/src/modules/blast/schemas.ts`)
  is kept in sync by hand; enum-like fields stay plain strings so a new server value
  does not break every call.
- Tests are co-located `<name>.test.ts`, hermetic (no real API/DB/LLM).

## Do-not-touch

- The lockfile — regenerate via `pnpm install` in this package only.
- Model-facing texts (tool descriptions, `instructions`) are user-approved
  verbatim; change them only via the plan.

## Commands

`pnpm start` · `pnpm typecheck` · `pnpm test`
(pnpm is not on PATH on some machines: `npx --yes pnpm@10 <cmd>`)
