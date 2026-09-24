---
name: design
description: "Source of truth for DevDigest UI visuals. Use whenever the task involves design, UI, layout, styling, colors, typography, spacing, a new page or component's look, 'как в макете', 'по дизайну', or matching a screenshot. Screenshots pasted in chat take priority over the reference file in the design/ folder."
---

# Design

Decides which visual reference to follow when building or changing UI.

## Source priority

1. **Screenshots pasted in the chat** — highest priority. They always win.
2. **The file in `design/`** (repo root) — fallback reference for anything the screenshots don't cover.
3. **Neither covers it** — ask the user. Do not invent visuals.

If a chat screenshot conflicts with the `design/` file, follow the screenshot and mention the conflict in one line.

## Reading the `design/` file

- It is a bundled standalone HTML (~1.8 MB). **Never `Read` it whole.**
- Use whatever single file is in `design/` (the name has spaces and parentheses — quote the path; it may be renamed).
- To inspect it, open it in the browser (playwright MCP: navigate to `file:///…/design/<file>`, then snapshot or screenshot), or `grep` / `head -c` for tokens (colors, fonts, spacing).

## Rules

- Do not redesign, simplify, or add visual elements unless explicitly asked (see "Design policy" in CLAUDE.md).
- Place files per `react-frontend-architecture`. Never edit `client/src/vendor/ui/**` — it is vendored.

## Verification

Before calling UI work done, screenshot the running client and compare it against the reference you followed (chat screenshot first, otherwise the `design/` file).
