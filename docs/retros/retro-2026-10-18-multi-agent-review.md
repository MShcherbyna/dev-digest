# Retro: Multi-Agent Review (spec → plan → implementation → review)

Session: `604ee715-5e9f-4948-adfc-d7a505b553f8` (2026-10-16 → 2026-10-18)
Spec: `specs/2026-10-16-multi-agent-review.md` (39 numbered AC + AC-28a/AC-36a = 41)
Plan: `docs/plans/multi-agent-review_en.md`
Ledger: `.claude/sdd-runs/multi-agent-review.md`

## Stats

| # | agent | description | model | start (UTC) | dur | turns | in | cache_w | cache_r | out | tool calls | errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | main | (orchestrator) | sonnet-5 | 19:34:08 | 146497s | 178 | 353 | 505318 | 37948128 | 121099 | 220 | 7 |
| 1 | spec-creator | Create Multi-Agent Review spec | opus-5-5 | 19:36:19 | 320s | 16 | 38 | 150722 | 1341697 | 17987 | 50 | 0 |
| 2 | researcher | Server review/run contracts | sonnet-5-5 | 19:36:58 | 118s | 14 | 28 | 119542 | 1013859 | 15271 | 41 | 0 |
| 3 | researcher | Client run UI current state | sonnet-5-5 | 19:37:07 | 179s | 22 | 44 | 116325 | 2014480 | 22985 | 42 | 1 |
| 4 | researcher | reviewer-core findings and dedup | sonnet-5-5 | 19:37:15 | 102s | 13 | 26 | 97836 | 951781 | 13433 | 42 | 0 |
| 5 | fork | Resume spec-creator with answers | sonnet-5 | 20:00:06 | 193s | 7 | 14 | 34104 | 844797 | 18086 | 6 | 0 |
| 6 | general-purpose | Translate spec to Ukrainian | sonnet-5 | 09:03:19 | 236s | 4 | 8 | 79866 | 180114 | 19516 | 3 | 0 |
| 7 | general-purpose | Resync Ukrainian spec translation | sonnet-5 | 10:05:30 | 82s | 5 | 10 | 88252 | 296567 | 7042 | 9 | 0 |
| 8 | implementation-planner | Plan Multi-Agent Review implementation | opus-5-5 | 10:10:26 | 1498s | 53 | 108 | 464471 | 7232363 | 96538 | 160 | 0 |
| 9 | implementation-planner | Continue Multi-Agent Review plan | opus-5-5 | 10:16:11 | 9s | 2 | 4 | 42241 | 36578 | 722 | 8 | 0 |
| 10 | implementer | Implement Phase 0: migration + contracts | sonnet-5 | 10:37:24 | 256s | 40 | 80 | 129906 | 4439186 | 18420 | 92 | 0 |
| 11 | implementer | Lane S: server implementation | sonnet-5 | 10:42:12 | 1173s | 114 | 228 | 315599 | 25872243 | 110105 | 272 | 3 |
| 12 | implementer | Lane C: client implementation | sonnet-5 | 10:42:29 | 989s | 155 | 310 | 252238 | 29166458 | 92214 | 376 | 3 |
| 13 | test-writer | Test-writer step 10: server tests | sonnet-5 | 11:02:17 | 663s | 68 | 136 | 199213 | 10086688 | 39787 | 168 | 1 |
| 14 | test-writer | Test-writer step 22: client tests | sonnet-5 | 11:02:29 | 967s | 116 | 232 | 251613 | 21209875 | 67076 | 294 | 2 |
| 15 | implementer | Step 23: docs update | sonnet-5 | 11:19:00 | 57s | 8 | 16 | 58725 | 402851 | 5093 | 28 | 0 |
| 16 | check-runner | Check-runner: server + client | haiku-5-5 | 11:20:18 | 110s | 5 | 10 | 29387 | 55997 | 4790 | 36 | 28 |
| 17 | architecture-reviewer | Architecture review of multi-agent-review | sonnet-5 | 11:23:28 | 218s | 33 | 66 | 138460 | 2911635 | 16533 | 122 | 32 |
| 18 | plan-verifier | Plan verification for multi-agent-review | sonnet-5 | 11:23:43 | 286s | 37 | 74 | 150580 | 3987718 | 21726 | 106 | 26 |
| 19 | implementer | Fix pass: NFR-5 accessibility findings | sonnet-5 | 11:29:10 | 303s | 37 | 74 | 98190 | 2774727 | 24723 | 78 | 2 |
| 20 | check-runner | Check-runner: verify a11y fix, client only | haiku-5-5 | 11:34:30 | 38s | 5 | 10 | 20628 | 47788 | 2413 | 18 | 12 |
| 21 | architecture-reviewer | Narrow architecture re-review: a11y fix | sonnet-5 | 11:35:50 | 64s | 10 | 20 | 49360 | 295160 | 5617 | 34 | 8 |
| 22 | plan-verifier | Narrow plan verification: NFR-5 fix | sonnet-5 | 11:36:03 | 102s | 17 | 34 | 46853 | 516308 | 7311 | 54 | 9 |

**Total** in=1923 cache_write=3439429 cache_read=153626998 out=748487; agents spawned: 22

### Order of agents

1. **spec-creator** (opus) fans out 3 **researcher** subagents (sonnet) in parallel (19:36:58/19:37:07/19:37:15, all within 20s of each other) to read server/client/reviewer-core run contracts before writing the spec.
2. **fork** (resume spec-creator with the user's 19 answers) — serial, 11h later (user took the gap to review).
3. **general-purpose** ×2, serial — Ukrainian translation, then a resync after spec edits (next day).
4. **implementation-planner** (opus) — hit a 45-turn limit mid-research, resumed once (#9, 9s/2 turns, essentially just continuing in the same context) — serial, single long agent.
5. **implementer** "Phase 0" (migration + contracts) — serial, blocks the next step.
6. **Lane S** and **Lane C** implementers launched in the same message (10:42:12 / 10:42:29) — true parallel fan-out, each resumed once/twice on its own turn limit.
7. **test-writer** step 10 (server) and step 22 (client) launched together (11:02:17 / 11:02:29) — parallel, each resumed once (server) or twice (client) on turn limits.
8. **implementer** "Step 23 docs" — serial, quick.
9. **check-runner** (haiku) — serial, full-suite confirmation.
10. **architecture-reviewer** and **plan-verifier** launched together (11:23:28 / 11:23:43) — parallel full review.
11. Fix-loop iteration 1: **implementer** fix pass (serial) → **check-runner** (serial) → **architecture-reviewer** + **plan-verifier** narrow re-review launched together (11:35:50 / 11:36:03) — parallel.

## Hard

- **Every substantial agent hit its default turn cap and needed an orchestrator resume.** Evidence: `implementation-planner` (45-turn limit, resumed), `implementer` Lane S (60-turn, resumed once), `implementer` Lane C (60-turn, resumed **twice**), `test-writer` step 10 (50-turn, resumed once), `test-writer` step 22 (50-turn, resumed **twice**), `implementer` fix pass (no resume needed — smaller scope). That is 9 separate "stopped at turn limit, partial result" notifications across a single feature build, each costing one `SendMessage` round-trip plus the orchestrator re-reading a summary to decide what to say.
- **`readonly-bash-guard.sh`'s absolute-path trap.** `check-runner` (both runs), `architecture-reviewer`, and `plan-verifier` collectively hit ~35 `PreToolUse:Bash hook error` blocks trying `pnpm -C <absolute worktree path> ...` or `npx --yes pnpm@10 -C <absolute path> ...` before falling back to the only pattern the guard's regex actually matches: `pnpm -C (server|client|e2e) ...` (relative package name only). Quote (`check-runner` transcript): *"readonly-bash-guard(verify): 'npx --yes pnpm@10 -C /Users/mtaku..."* repeated verbatim across runs.
- **`architecture-reviewer` defaults to shell `grep`/`find` even though its Bash is git-only.** ~15 blocked attempts (`grep -n "^import" ...`, `find server/src/modules/multi-agent-run ...`, `git grep -n ...`) under `readonly-bash-guard.sh git` mode, which only allows `git diff|status|log|show|merge-base|rev-parse|ls-files|blame`. The guard's own block message literally says *"'echo use-grep-tool-instead' is not on the read-only allowlist"* — a hint the agent did eventually act on, but only after many retries.
- `implementer` (Lane S) hit `Read: EISDIR` twice trying to read `server/src/modules/reviews` as a file (it's a directory) — a guessed path, not a listed one.
- `implementer`/`test-writer` hit `Read: File does not exist` 2× each — again, guessed paths before verifying existence with Glob/ls.
- `check-runner` logged "server lint" as a failure twice (`ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL: Command "lint" not found"`) — `server/package.json` has no `lint` script at all; this isn't a regression, but `check-runner`'s brief didn't account for the asymmetry (client has lint, server doesn't), and it was logged as a bare failure both times rather than "N/A".
- One real **permission stall**: the orchestrator's first `AskUserQuestion` about the `/multi-agent-review` landing-page state (before the user had supplied the design file) was rejected by the user with "clarify first" — correctly handled (the orchestrator asked what to clarify instead of re-asking blind), but it's the one place in the run where a question was asked before enough information existed to frame good options.

## Easy

- The 3 parallel **researcher** subagents (spec-creator's own fan-out) each finished in 100–180s / 13–22 turns with 0–1 errors — clean, narrow, read-only scope (one package each) is exactly where this agent type is cheap and fast.
- **Narrow re-review (fix-loop iteration 1) was fast because the scope was named exactly.** `architecture-reviewer`'s narrow pass: 64s / 10 turns, verdict CLEAN, 0 findings. `plan-verifier`'s narrow pass: 102s / 17 turns, 3/3 PASS. Both were told the 3 exact files and the 3 exact prior findings (F-4/F-5/F-6) instead of "re-review everything" — this is the fix-loop's "narrow mode" working as designed, and it's visibly ~3-4x cheaper than the first full review pass for each agent.
- `check-runner` on `haiku-5-5` for a mechanical pass/fail table was the right model choice both times — cheap, fast (110s/38s), and its job (run commands, report pass/fail) doesn't need judgment.

## Duplicated

- `server/AGENTS.md`, `client/AGENTS.md`, `server/INSIGHTS.md`, `client/INSIGHTS.md` were each independently read by 5-7 different agent generations (`spec-creator`, `implementation-planner`, both `implementer` lanes, both `test-writer` lanes). This is the `engineering-insights` skill's own "read at the start of any task" rule working as intended — not a bug — but it means the same ~4 files were paid for in full 5-7 times across the run with no sharing between agents.
- The 5 original design screenshots (`emdash-drop-*.png`) were each read 2-3 times: `spec-creator`, `implementation-planner`, and `implementer` (Lane C) all opened the raw PNGs directly. Image tokens are expensive relative to text; `spec-creator` already wrote a detailed prose description of each screenshot into the spec (file states, exact UI copy, layout), which should have been enough for `implementation-planner` (a planning task, not a pixel-matching one) — only the agent that actually builds the UI (`implementer` Lane C) strictly needed the raw images.
- `specs/2026-10-16-multi-agent-review.md` was read twice *within* the same agent call by `main`, `implementation-planner`, both `implementer` lanes, and `test-writer` — a read-then-reread pattern, likely re-confirming a detail mid-task rather than caching the first read.
- `server/src/modules/reviews/run-executor.ts` was read 18 times by the Lane S `implementer` alone (the file it was most heavily modifying) — expected for an actively-edited file, not duplication across agents.

## Missed

- **AC-41 is a dangling reference.** `specs/2026-10-16-multi-agent-review.md:123` cites "(AC-41)" for the known `GET /runs/:id/trace` workspace-check gap, but no `AC-41` criterion was ever written (the spec's actual criteria stop at AC-38, plus the two lettered additions AC-28a/AC-36a). Nobody — not the `spec-creator`'s own self-check, not `implementation-planner`, not `plan-verifier` — caught the gap; it only surfaced because this retro's AC-coverage check diffs AC-ids between spec and plan. Harmless in effect (the referenced gap *is* correctly tracked in prose, under the wrong label), but it's exactly the kind of inconsistency an id-continuity self-check would catch for free.
- **All browser-only acceptance checks are unverified by any agent.** Plan §8's 8 browser steps against screenshots S1-S5, AC-13 (Configure run's step-2 disabled state), and AC-36a's exact visual match to the `e-ma` design artboard were never exercised — no agent in this run had a browser tool. This is an accepted, named gap (both `architecture-reviewer`/`plan-verifier` reports say so explicitly), but it means real visual-fidelity risk is still open after a "complete" fix-loop.
- The sidebar `nav.ts` edit (F-1) and the dev-DB migration (F-2) were correctly identified as hook-blocked for every subagent, but neither the plan nor any agent flagged *in advance* that `implementer-guard.sh`'s do-not-touch list is unconditional — i.e. that user pre-approval in the plan (Q-5) would not actually unblock an agent at execution time. This was discovered only when the `implementer` hit the block live, costing a full plan-to-implementation round-trip before the orchestrator realized it had to apply the fix itself outside any subagent.

## Outliers & permission stalls

All 4 cost outliers (median subagent cost 128,914; threshold 2x) scale with genuine deliverable size, not waste:

- **`implementation-planner`** (4.4x median, 561,117): read 3 packages' modules in full, the 41-AC spec, the design file, and wrote a 1000+ line plan with 10 clarifying questions after finding the "Current state" section of the spec didn't match the real code. The cost bought a plan detailed enough that neither implementer lane needed to improvise or ask a question mid-build.
- **`implementer` Lane S** (3.3x, 425,932) and **Lane C** (2.7x, 344,762): each built an entire module/route-tree from scratch (Lane S: domain/ports/repository/service/routes + executor changes across ~15 files; Lane C: ~25 new/changed files across 3 new routes). Cost tracks file count, not rework.
- **`test-writer` step 22** (2.5x, 318,921): 7 new RTL test files + 3 extensions, each needing its own component-level mock/render setup. Same pattern — proportional to deliverable, not waste.

**Permission denials/stalls:** 1 — the orchestrator's `AskUserQuestion` about the `/multi-agent-review` landing page was rejected once by the user (before the design file existed in the repo); the orchestrator correctly asked "what do you want to clarify?" instead of re-asking blind, and the next turn supplied the missing design file. No other user-facing denials occurred; the ~90 *hook*-level denials above are agent-vs-guard, not agent-vs-user.

## AC coverage

Spec has 39 numbered AC ids (+ AC-28a, AC-36a = 41 total criteria).

- **Not mentioned in the plan:** `AC-41` — because it does not exist as a defined criterion (see Missed, above); the plan correctly covers the *gap it refers to* under AC-38's "access" discussion, just not under a matching id.
- **In plan/reports but not in spec:** none — no stale ids found.
- No `--report` file was passed to the stats script (the architecture-reviewer/plan-verifier findings were relayed as agent-result text, never written to a tracked file) — the AC-coverage check above is spec-vs-plan only, not spec-vs-final-review. Separately, both the full and narrow `plan-verifier` passes (summarized in chat, not as files) independently confirmed PASS/BLOCKED/NOT-VERIFIABLE for essentially all 39+2 criteria, consistent with this coverage check.

## Recommendations

1. **Raise the default turn budget for `implementer`/`test-writer`/`implementation-planner` on full-feature scope, or split "research" from "write" explicitly.** 9 separate turn-limit stops forced 9 orchestrator resume round-trips across this one feature. None of the resumed work was wasted, so the fix isn't "do less" — it's giving these agent types more runway before they're cut off, especially `implementation-planner` and any `implementer` lane building a brand-new module across 15+ files.
2. **Tell `check-runner`, `architecture-reviewer`, and `plan-verifier` up front that their allowed `pnpm`/`git` commands must use the package's relative name, never the worktree's absolute path.** `readonly-bash-guard.sh`'s regex (`(npx --yes pnpm@10|pnpm) -C (server|client|e2e) (typecheck|test|lint)`) only matches the literal words `server`/`client`/`e2e`; ~35 blocked attempts across 2 check-runner runs + plan-verifier (both passes) used an absolute path first. A one-line addition to each agent's system prompt ("always `pnpm -C client ...`, never a full path") would remove this whole retry class.
3. **Tell `architecture-reviewer` explicitly to use its Grep/Glob/Read tools instead of shell `grep`/`find`/`git grep`.** Its Bash is restricted to `git diff|status|log|show|merge-base|rev-parse|ls-files|blame` only; ~15 blocked attempts went to `grep`/`find`/`git grep` before it adapted. The guard's own error message already nudges this ("use-grep-tool-instead") — promoting that into the agent's own prompt would skip the trial-and-error entirely.
4. **Reserve raw screenshot reads for the agent that implements pixel-level UI; let planning-stage agents work from the spec's prose description.** `implementation-planner` re-opened all 5 PNGs that `spec-creator` had already described in detail in the spec text — for a planning task (not a layout-matching one), the text description should suffice, saving image-token cost at the planner stage. `implementer` (Lane C) legitimately needs the raw images.
5. **Add a final AC-id continuity check to `spec-creator`'s own self-check** (no gaps, no reference to an id that was never defined as its own criterion) — would have caught `AC-41` for free instead of relying on this retro's script.
6. **Document, in the plan-authoring guidance (or in `implementer-guard.sh`'s own header comment), that user/plan pre-approval of a vendored-path edit does NOT unblock the hook at execution time** — only an edit from outside the guarded subagent (the orchestrator itself, or a human) can touch `vendor/shared`, `vendor/ui`, migrations, or the lockfile, regardless of what the plan says. This was discovered live rather than planned for, costing one extra loop (implementer hits the block → reports it → orchestrator applies the fix itself in a later turn, after the user re-confirmed).
7. **`check-runner`'s brief should expect server/client script asymmetry** (server has no `lint` script, client does) and report a missing script as "N/A: no `lint` script defined" rather than a bare failure — it was logged as a failure in both check-runner runs even though nothing regressed.

## vs previous (`retro-2026-10-14-eval-pipeline.md`)

| | this run | eval-pipeline | delta |
|---|---|---|---|
| agents spawned | 22 | 35 | fewer agents, but each one larger (full-stack feature vs. harness work) |
| in | 1,923 | 1,502 | +28% |
| cache_write | 3,439,429 | 3,893,234 | -12% |
| cache_read | 153,626,998 | 92,054,627 | +67% (many more resumes → more context re-read per resume) |
| out | 748,487 | 178,798 | +4.2x (41-AC cross-module feature vs. a narrower harness change) |
| tool errors (raw count) | 134 | 84 | +60% — driven almost entirely by the `readonly-bash-guard` absolute-path/grep-vs-Bash pattern (recommendations 2-3), which the eval-pipeline run apparently didn't hit as often |
