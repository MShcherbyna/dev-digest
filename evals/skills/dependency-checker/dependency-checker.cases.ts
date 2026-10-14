import { fixtureReader, type SkillCase } from "../../src/index.js";

// This skill's real work is done by scripts/collect.mjs, but "quality" cases run with no tools
// (skillTask measures the SKILL.md content in isolation — see tasks.ts), so the script cannot run here.
// Instead each prompt inlines fixtures/deps-sample.json — a trimmed snapshot of the script's real output
// for this repo (offline mode) — and the cases check how the skill turns that JSON into a report:
// structure, prioritisation, and honesty about what was and was not measured.
//
// Facts baked into the fixture that the practices below rely on:
//  - offline run: no audit/outdated data; zod has different semver *ranges* but one installed version;
//  - versionDrift only for @types/node and tsx; vendor/shared copies differ in 5 files;
//  - only sanctioned edges (@devdigest/* alias, vendored shared) — no cross-package boundary violation;
//  - unused candidates: client postcss, reviewer-core tsx, server testcontainers + @fastify/autoload;
//  - actionable cycles: server brief<->db and adapters->blast->repo-intel; mcp gateway<->lib.
const fx = fixtureReader(import.meta.url);

const REPO_DATA = `Here is the output of scripts/collect.mjs (offline mode) for this repo — treat it as already collected, and produce the report directly from it (do not ask for tool access or more data). The numbers in it are the only numbers you may use.

\`\`\`json
${fx("deps-sample.json")}
\`\`\``;

export const cases: SkillCase[] = [
  {
    name: "full report follows the required 7-section structure with a Mermaid graph",
    kind: "quality",
    prompt: `Run a dependency check on this repo. I want the full report: graph, sizes, health, prioritized actions, advice.\n\n${REPO_DATA}`,
    grounding: ["```mermaid", "flowchart"],
    practices: [
      "the report has these sections in order: Summary, Dependency map, Weight, Health, Prioritised actions, Advice, Method and limits (equivalent names are fine, but all seven are present)",
      "the Dependency map section contains a fenced ```mermaid code block using flowchart that shows the packages (client, server, reviewer-core, mcp, e2e, evals) and the vendor/shared link",
      "the Weight section has a table with dependency, kind, version and installed size (own and/or with transitive), not just a vague size statement",
      "the prioritised actions are one table ordered from P0 to P3 whose rows each have a finding, evidence, an action and an effort",
      "the Advice section gives 3-5 bullets that follow from the evidence above (e.g. which dependency family drives weight), not generic best-practice filler",
      "every finding names a specific package, dependency, or file rather than giving generic advice like 'consider optimizing dependencies'",
    ],
    threshold: 0.7,
    maxTurns: 10,
  },
  {
    name: "separates sanctioned internal links from violations and external npm dependencies",
    kind: "quality",
    prompt: `This repo isn't a monorepo — server, client and reviewer-core share code via TypeScript path aliases and a vendored @devdigest/shared copy, not workspace:* packages. Analyze our dependencies, including how these packages depend on each other internally.\n\n${REPO_DATA}`,
    practices: [
      "the answer explicitly distinguishes internal cross-package links (the @devdigest/shared vendored alias and the server -> reviewer-core alias) from external npm package dependencies, rather than treating them as the same kind of dependency",
      "the answer does not invent a package-boundary violation: the fixture only has sanctioned alias/vendored edges, so no relative-cross-package or deep-import problem is reported",
      "the answer reports that the server and client copies of vendor/shared differ, naming that the diff covers 5 files (e.g. adapters.ts, contracts/trace.ts) and recommends re-syncing from the source rather than editing a copy",
      "the answer does not claim these packages are linked via workspace:* or pnpm workspaces, since the project explicitly is not a monorepo",
    ],
    threshold: 0.6,
    maxTurns: 10,
  },
  {
    name: "prioritises with P0-P3, treats candidates as candidates and does not claim unmeasured checks are clean",
    kind: "quality",
    prompt: `We suspect some npm dependencies are unused or duplicated across packages with different versions, and I need to know if we are safe to release. Check our dependencies and tell me what to prioritize fixing first.\n\n${REPO_DATA}`,
    practices: [
      "findings are explicitly labeled with one of the defined severity tiers (P0, P1, P2, or P3) rather than left unranked",
      "the answer states that the security audit and outdated checks were not run (offline mode) and does not describe the repo as free of vulnerabilities or 'clean' on security",
      "the answer lists postcss, tsx (reviewer-core), testcontainers and @fastify/autoload as unused CANDIDATES to verify, not as confirmed-unused dependencies and not as already removed",
      "the answer calls out @types/node and tsx as installed-version drift across packages, and treats zod as informational only because the ranges differ but the installed version is the same",
      "the answer flags the internal module cycles (server brief<->db and adapters->blast->repo-intel, mcp gateway<->lib) with their packages, and does not treat the server's composition-root (platform) edges as a defect",
      "each recommendation names a specific package name and package.json/file location, and any change is presented as a command for the user to run or confirm, not something already executed",
      "the answer does not add up per-dependency 'with transitive' sizes into a package total, and notes that sizes are install sizes on disk, not bundle sizes",
    ],
    threshold: 0.6,
    maxTurns: 10,
  },
];
