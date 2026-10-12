---
name: workflow-retro
description: >-
  Post-mortem of a finished multi-agent workflow session (spec-creator,
  implementation-planner, /run-plan, reviewers, researchers). Collects
  deterministic stats (tokens per agent, agent count and launch order, time,
  tool calls, tool errors, duplicated file reads) from the session
  transcripts, then writes a short report: what was hard, what was easy, what
  was duplicated, what was missed, and recommendations for the agents and
  skills. Manual invocation only, run at the end of the workflow.
  Triggers: "workflow retro", "how did the agents do", "session cost",
  "agent insights", "retro of the run".
disable-model-invocation: true
argument-hint: "[session-id]"
---

# workflow-retro

Runs **after** a workflow, in the same or a fresh chat. Read-only on the
code: its only write is the report file in `docs/retros/`. Numbers come from a script, never
from memory; judgement comes from reading the transcripts.

## Steps

1. **Stats.** Run
   `python3 .claude/skills/workflow-retro/scripts/session_stats.py [session-id] [--spec <spec.md>] [--plan <plan.md>] [--report <verifier-or-review.md> ...]`
   (default: latest session of this project). Pass `--spec`/`--plan`/
   `--report` when the workflow produced them (paths from the ledger in
   `.claude/sdd-runs/`); without them the AC coverage section is skipped. Transcripts live in
   `~/.claude/projects/<project-slug>/<session>.jsonl`, subagents in
   `<session>/subagents/agent-*.jsonl` with a `.meta.json` (agentType,
   description). Paste the script output into the report unchanged.
   - `cache_read` is the cheap re-read of context, `cache_write` + `in` +
     `out` is what actually costs. Report both, rank agents by
     `in + cache_write + out`.
   - Script sections: stats table, tool calls, duplicate reads, tool errors,
     **cost outliers** (agents above 2× the subagent median), **permission
     denials/stalls** (user-rejected tool calls and auto-mode denials: each
     one stalled or changed a run, say which agent and what it wanted),
     **AC coverage** (spec AC ids missing from the plan or from every
     verifier/review report, and ids in plan/reports that the spec no longer
     has).
   - Launch order = sort by `start`. Several agents with the same start
     second ran in parallel; say so instead of listing them as a sequence.
2. **Read each subagent transcript** (final report, the questions it asked,
   its errors, any retry). Do not re-read files the agents read; judge from
   their transcripts. Skim, do not summarise line by line.
3. **Analyse**, one short list each, every item with evidence (agent name,
   file or quoted error), no generic advice:
   - **Hard:** retries, tool errors, dead ends, questions the agent could
     not answer itself, tools it lacked (e.g. no AskUserQuestion), a prompt
     it had to guess at.
   - **Easy:** what finished in few turns and why (clear input, existing
     INSIGHTS entry, good skill).
   - **Duplicated:** files in the "read by 2+ agents" list, the same research
     done by two agents, the same context pasted into several prompts,
     reports restated by the orchestrator.
   - **Missed:** requirements, edge cases or checks nobody covered; steps in
     the workflow that were skipped; facts an agent found out of scope and
     nobody recorded.
   - **Outliers:** for every flagged agent say why (long research, repeated
     reads, large prompt, retries) and whether the cost bought anything.
   - **Coverage gaps:** for every AC the script lists, open the plan/report
     and say whether it is truly unchecked or just referenced by other words.
   - **Model/cost fit:** an expensive model on a mechanical job, a cheap one
     that needed a redo, parallelism that was possible but not used.
4. **Recommendations.** Max 7, ranked by saved tokens or avoided rework.
   Each names the exact target (agent file, skill, prompt, workflow step)
   and the concrete change. Use the checklist below to find candidates.
5. **Write** `docs/retros/retro-<YYYY-MM-DD>-<feature>.md` (tracked in git,
   create the folder if missing) with sections: Stats (script output),
   Order of agents, Hard, Easy, Duplicated, Missed, Outliers & permission
   stalls, AC coverage, Recommendations. **Also print the same report in the
   chat** (full text, not a link), then the file path. If a previous
   `docs/retros/` file exists, add a "vs previous" line (agents, tokens,
   errors). Do not edit agents or skills yourself; propose, the user decides.
6. **Insights.** If a finding is non-obvious and reusable, offer to record it
   via the `engineering-insights` skill in the right `INSIGHTS.md`; don't
   write it without asking.

## Recommendation checklist (what else to look for)

- Context handoff: pass paths and short summaries, not pasted reports.
- A shared "facts" file for research that several agents repeat.
- Agents that need a question tool but have none: orchestrator must relay.
- Per-agent token budget or turn cap; flag outliers (> 2× median).
- Cheaper model for read-only/mechanical agents, stronger for spec/plan.
- Acceptance checks that were manual and could be a script or e2e.
- Spec/plan drift: AC count vs. what the plan covers, items nobody verified.
- Missing guard rails (permissions prompts that stalled a run, forbidden
  paths touched, vendored copies edited in one place only).
- Time: serial steps that could run in parallel, long waits on one agent.
- Trend: compare with the previous `docs/retros/` file (agents, tokens, errors).
- Permission stalls: repeated denials of the same command mean an allowlist
  entry (see `fewer-permission-prompts`) or a prompt that should avoid it.

## Limits

- Token counts are per assistant message (deduped by message id); thinking
  tokens are inside `out`. No USD: prices change, and the transcripts do not
  carry them. Convert only if the user supplies a price table.
- A subagent's transcript may be missing if the session was cleaned up; say
  which agents could not be analysed.
