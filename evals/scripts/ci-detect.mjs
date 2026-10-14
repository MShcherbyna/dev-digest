/**
 * CI change detector for the harness evals.
 *
 * Reads a newline-separated list of changed files (repo-relative) from $CHANGED_FILES and maps
 * them onto the eval suites that should run for this PR:
 *
 *   .claude/skills/<name>/**   OR  evals/skills/<name>/**   → run evals/skills/<name>  (content tier)
 *   .claude/agents/<name>.md   OR  evals/agents/<name>/**   → run evals/agents/<name>  (tool tier)
 *   workflow tier runs when any of these change:
 *     CLAUDE.md, .claude/CLAUDE.md, AGENTS.md (real file behind the CLAUDE.md symlink),
 *     <server|client|reviewer-core|e2e|mcp>/AGENTS.md, .claude/agents/*.md,
 *     evals/workflow/**, evals/src/**, evals/proxy/**,
 *     evals/{package.json, lockfile, pnpm-workspace.yaml, vitest.config.ts, tsconfig.json},
 *     evals/scripts/litellm-proxy.sh
 *
 * EVAL_RUN_ALL=true ignores CHANGED_FILES and selects every skill/agent that has evals plus the
 * workflow tier.
 *
 * A changed artifact with NO written evals is NOT a failure: it is reported on the `skipped_*`
 * outputs so the job can print a visible "SKIP <name> (no evals)" line instead of going red.
 *
 * Emits GitHub Actions step outputs (skills, agents, run_workflow, skipped_skills, skipped_agents)
 * to $GITHUB_OUTPUT and a Markdown summary to $GITHUB_STEP_SUMMARY. Pure filesystem + string
 * work — no deps.
 */

import { existsSync, readdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const runAll = process.env.EVAL_RUN_ALL === "true";

const changed = (process.env.CHANGED_FILES ?? "")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

/** Does evals/<tier>/<name>/ contain at least one *.eval.ts? */
function hasEvals(tier, name) {
  const dir = join(EVALS_DIR, tier, name);
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.endsWith(".eval.ts"));
}

/** Every directory name under evals/<tier>/ (empty when the tier directory is missing). */
function allNames(tier) {
  const dir = join(EVALS_DIR, tier);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/** Collect distinct artifact names touched under a `.claude` and/or `evals` prefix. */
function touched(reClaude, reEvals) {
  const names = new Set();
  for (const f of changed) {
    const m = f.match(reClaude) ?? f.match(reEvals);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

let skills;
let agents;
let skippedSkills;
let skippedAgents;
let runWorkflow;

if (runAll) {
  skills = allNames("skills").filter((n) => hasEvals("skills", n));
  agents = allNames("agents").filter((n) => hasEvals("agents", n));
  skippedSkills = [];
  skippedAgents = [];
  runWorkflow = true;
} else {
  const skillNames = touched(
    /^\.claude\/skills\/([^/]+)\//,
    /^evals\/skills\/([^/]+)\//,
  );
  const agentNames = touched(
    /^\.claude\/agents\/([^/]+)\.md$/,
    /^evals\/agents\/([^/]+)\//,
  );

  skills = skillNames.filter((n) => hasEvals("skills", n));
  skippedSkills = skillNames.filter((n) => !hasEvals("skills", n));
  agents = agentNames.filter((n) => hasEvals("agents", n));
  skippedAgents = agentNames.filter((n) => !hasEvals("agents", n));

  // The workflow tier measures the LIVE harness, so anything that changes it re-triggers it:
  // the instruction files (CLAUDE.md is a symlink to AGENTS.md, so git reports AGENTS.md), any
  // agent definition, the workflow cases, the engine, and the eval toolchain/proxy config.
  runWorkflow = changed.some(
    (f) =>
      f === "CLAUDE.md" ||
      f === ".claude/CLAUDE.md" ||
      f === "AGENTS.md" ||
      /^(server|client|reviewer-core|e2e|mcp)\/AGENTS\.md$/.test(f) ||
      /^\.claude\/agents\/.+\.md$/.test(f) ||
      /^evals\/workflow\//.test(f) ||
      /^evals\/src\//.test(f) ||
      /^evals\/proxy\//.test(f) ||
      /^evals\/(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|vitest\.config\.ts|tsconfig\.json)$/.test(f) ||
      f === "evals/scripts/litellm-proxy.sh",
  );
}

const out = process.env.GITHUB_OUTPUT;
const write = (k, v) => (out ? appendFileSync(out, `${k}=${v}\n`) : console.log(`${k}=${v}`));

write("skills", JSON.stringify(skills));
write("agents", JSON.stringify(agents));
write("run_workflow", String(runWorkflow));
write("skipped_skills", skippedSkills.join(" "));
write("skipped_agents", skippedAgents.join(" "));

// Human-readable summary in the step log.
console.error("── eval change detection ──");
console.error(runAll ? "mode          : run_all" : `changed files : ${changed.length}`);
console.error(`skills → run  : ${skills.join(", ") || "(none)"}`);
console.error(`agents → run  : ${agents.join(", ") || "(none)"}`);
console.error(`workflow tier : ${runWorkflow ? "run" : "skip"}`);
const skipLines = [...skippedSkills, ...skippedAgents].map((n) => `SKIP ${n} (no evals)`);
for (const line of skipLines) console.error(line);

// Step summary (GitHub UI).
const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) {
  const md = [
    "### Harness evals - change detection",
    "",
    runAll ? "mode: `run_all`" : `changed files: ${changed.length}`,
    "",
    "| tier | to run |",
    "| --- | --- |",
    `| skills | ${skills.join(", ") || "(none)"} |`,
    `| agents | ${agents.join(", ") || "(none)"} |`,
    `| workflow tier | ${runWorkflow ? "run" : "skip"} |`,
    "",
    ...skipLines.map((l) => `- ${l}`),
    "",
  ].join("\n");
  appendFileSync(summary, md);
}
