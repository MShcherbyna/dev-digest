/**
 * Case types + the runners that turn a data array into vitest tests. This module owns the ONE
 * true measure → (log) → assert body, so case authors never rewrite it — which is exactly what
 * keeps the "assert before record" bug from recurring once record() lands (T2 slots into the
 * marked spot below, in this one file).
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "vitest";
import { DEFAULT_THRESHOLD } from "../config.js";
import { skillTask, agentTask, workflowTask } from "../tasks.js";
import { runClaude, type Result, type RunOptions } from "../runtime/run-claude.js";
import { patternMatch } from "../scoring/pattern-match.js";
import { llmJudge, type Verdict } from "../scoring/llm-judge.js";
import { logTrace, logVerdict } from "../logging/log.js";
import { record } from "../records/record.js";
import { REPO_ROOT } from "../artifacts/paths.js";

// --- Case shapes ------------------------------------------------------------

/** A judge-and-grounding case. Same shape for skills and agents; only the task differs. */
export interface QualityCase {
  name: string;
  kind?: "quality" | "grounding";
  prompt: string;
  /** Practices the judge scores (quality). Omit for a pure grounding case. */
  practices?: string[];
  /** Substrings that must ALL appear before the judge runs (cheap-tier gate). */
  grounding?: string[];
  /** Judge score gate (default 0.6). */
  threshold?: number;
  maxTurns?: number;
}
export type SkillCase = QualityCase;
export type AgentCase = QualityCase;

/** A trace-asserted workflow case — a discriminated union routed by `kind`. */
export type WorkflowCase =
  | { kind: "dispatch"; name: string; prompt: string; expectSubagent: string; maxTurns?: number }
  | {
      kind: "activation";
      name: string;
      prompt: string;
      skill: string;
      shouldActivate: boolean;
      maxTurns?: number;
    }
  | {
      // Control vs treatment: the SAME prompt in the SAME repo, once with the on-disk harness
      // (treatment) and once without it (control, settingSources:[]). Only the harness differs,
      // so an expectation met in treatment but not in control is the harness's doing, not the
      // model's general knowledge. Give at least one of expectFileRead / expectOutputIncludes.
      kind: "contrast";
      name: string;
      prompt: string;
      expectFileRead?: string;
      /** Case-insensitive substrings the treatment answer must ALL contain and the control must not. */
      expectOutputIncludes?: string[];
      tools?: string[];
      maxTurns?: number;
    }
  | {
      // A single-session composite: run ONE workflowTask and assert several trace facets at once.
      // Cheaper than separate dispatch/activation/contrast cases (one session, not N) at the cost
      // of coarser diagnostics and no control run — use contrast when you must isolate CLAUDE.md's
      // contribution. Every provided expectation must hold; omitted fields are not checked.
      kind: "trace";
      name: string;
      prompt: string;
      expectSubagents?: string[];
      expectSkills?: string[];
      expectFilesRead?: string[];
      maxTurns?: number;
    };

/**
 * Was this repo-relative file read? Exact match on the absolute path — a bare `includes` let any
 * `README.md` (server/, .claude/skills/, ...) satisfy an expectation for the root one.
 */
export function wasRead(filesRead: string[], file: string): boolean {
  const abs = join(REPO_ROOT, file);
  return filesRead.some((f) => f === abs || f === file);
}

/** Did a skill engage? Either an explicit Skill tool-call, or reading its SKILL.md. */
export function activated(result: Result, skill: string): boolean {
  const bySkill = result.skillsInvoked.some((s) => s === skill || s.endsWith(`:${skill}`));
  const byRead = result.filesRead.some((f) => f.includes(`skills/${skill}/SKILL.md`));
  return bySkill || byRead;
}

/**
 * Control cwd for `contrast`: the repo's tracked files at HEAD, extracted to a tmpdir with the
 * harness (CLAUDE.md, AGENTS.md, .claude/) removed. Running the control in REPO_ROOT itself is NOT
 * clean even with settingSources:[] — rules still leak in by path (observed: the branch-prefix rule
 * from the path-keyed auto-memory), so the control matched the treatment. A different path with
 * the same docs/code keeps the only variable the harness. Built once per process.
 */
let controlRepoDir: string | undefined;
function controlRepo(): string {
  if (controlRepoDir) return controlRepoDir;
  const dir = mkdtempSync(join(tmpdir(), "eval-control-"));
  const archive = execFileSync("git", ["-C", REPO_ROOT, "archive", "HEAD"], { maxBuffer: 1 << 28 });
  execFileSync("tar", ["-x", "-C", dir], { input: archive });
  const harness = execFileSync("find", [dir, "(", "-name", "CLAUDE.md", "-o", "-name", "AGENTS.md", "-o", "-name", ".claude", ")", "-prune"], {
    encoding: "utf8",
  });
  for (const p of harness.split("\n").filter(Boolean)) rmSync(p, { recursive: true, force: true });
  controlRepoDir = dir;
  return dir;
}

/** Map a control-run path back onto REPO_ROOT so wasRead() compares like with like. */
const fromControl = (files: string[]) =>
  files.map((f) => (controlRepoDir && f.startsWith(controlRepoDir) ? join(REPO_ROOT, f.slice(controlRepoDir.length)) : f));

// --- Runners ----------------------------------------------------------------

type Task = (prompt: string, artifact: string, opts?: RunOptions) => Promise<Result>;

function runQualityCases(artifact: string, cases: QualityCase[], task: Task): void {
  for (const c of cases) {
    test(c.name, async () => {
      const threshold = c.threshold ?? DEFAULT_THRESHOLD;
      const result = await task(c.prompt, artifact, { maxTurns: c.maxTurns });
      logTrace(c.name, result);

      // measure → record → assert. Everything measurable runs in the try; record() fires in the
      // finally with whatever accumulated; the asserts happen strictly after. A failing config
      // (e.g. baseline: grounding gate fails, judge skipped) still leaves a record.
      let grounded: number | undefined;
      let verdict: Verdict | undefined;
      try {
        // Cheap deterministic tier first — the grounding gate. When it fails the judge is skipped.
        if (c.grounding?.length) grounded = patternMatch(result.text, c.grounding);
        if (c.practices?.length && (grounded === undefined || grounded === 1)) {
          verdict = await llmJudge(result.text, c.practices);
          logVerdict(c.name, verdict);
        }
      } finally {
        record(c.name, { result, verdict, grounded, threshold });
      }

      if (grounded !== undefined) {
        expect(grounded, `missing concrete evidence; output:\n${result.text}`).toBe(1);
      }
      if (verdict) {
        expect(verdict.score, JSON.stringify(verdict.results)).toBeGreaterThanOrEqual(threshold);
      }
    });
  }
}

export const runSkillCases = (skill: string, cases: SkillCase[]) => runQualityCases(skill, cases, skillTask);
export const runAgentCases = (agent: string, cases: AgentCase[]) => runQualityCases(agent, cases, agentTask);

export function runWorkflowCases(cases: WorkflowCase[]): void {
  for (const c of cases) {
    test(c.name, async () => {
      if (c.kind === "dispatch") {
        // Stop the moment the subagent is launched — no need to wait out its nested session.
        const expect1 = c.expectSubagent;
        const result = await workflowTask(c.prompt, {
          maxTurns: c.maxTurns,
          stopWhen: (p) => p.subagents.includes(expect1),
        });
        logTrace(c.name, result);
        try {
          expect(result.subagents, `subagents: ${result.subagents.join(", ")}`).toContain(c.expectSubagent);
        } finally {
          record(c.name, { result });
        }
      } else if (c.kind === "activation") {
        const result = await workflowTask(c.prompt, { maxTurns: c.maxTurns });
        logTrace(c.name, result);
        try {
          expect(
            activated(result, c.skill),
            `skills: ${result.skillsInvoked.join(", ")} | reads: ${result.filesRead.join(", ")}`,
          ).toBe(c.shouldActivate);
          expect(result.isError).toBe(false);
        } finally {
          record(c.name, { result });
        }
      } else if (c.kind === "trace") {
        // One session, many asserts — every provided expectation is checked against the same trace.
        // Stop as soon as ALL expectations are satisfied (e.g. doc read + subagent launched), so a
        // dispatch-bearing trace doesn't pay for the nested subagent's full run.
        const subs = c.expectSubagents ?? [];
        const skls = c.expectSkills ?? [];
        const files = c.expectFilesRead ?? [];
        const skillEngaged = (p: { skillsInvoked: string[]; filesRead: string[] }, skill: string) =>
          p.skillsInvoked.some((s) => s === skill || s.endsWith(`:${skill}`)) ||
          p.filesRead.some((f) => f.includes(`skills/${skill}/SKILL.md`));
        const result = await workflowTask(c.prompt, {
          maxTurns: c.maxTurns,
          stopWhen: (p) =>
            subs.every((s) => p.subagents.includes(s)) &&
            skls.every((s) => skillEngaged(p, s)) &&
            files.every((f) => wasRead(p.filesRead, f)),
        });
        logTrace(c.name, result);
        try {
          for (const sub of c.expectSubagents ?? []) {
            expect(result.subagents, `subagents: ${result.subagents.join(", ")}`).toContain(sub);
          }
          for (const skill of c.expectSkills ?? []) {
            expect(
              activated(result, skill),
              `skill ${skill} not engaged | skills: ${result.skillsInvoked.join(", ")} | reads: ${result.filesRead.join(", ")}`,
            ).toBe(true);
          }
          for (const file of c.expectFilesRead ?? []) {
            expect(
              wasRead(result.filesRead, file),
              `${file} not read | reads: ${result.filesRead.join(", ")}`,
            ).toBe(true);
          }
          expect(result.isError).toBe(false);
        } finally {
          record(c.name, { result });
        }
      } else {
        // contrast: treatment (real harness) vs control (harness-free copy of the repo, see
        // controlRepo). The control used to run in an empty tmpdir, where the expected file does not
        // exist — "control did not read it" then held trivially and the case proved nothing.
        const tools = c.tools ?? ["Read", "Grep", "Glob"];
        const treatment = await workflowTask(c.prompt, { allowedTools: tools, maxTurns: c.maxTurns });
        const control = await runClaude(c.prompt, {
          allowedTools: tools,
          maxTurns: c.maxTurns,
          cwd: controlRepo(),
          settingSources: [],
        });
        logTrace(`${c.name} [treatment]`, treatment);
        logTrace(`${c.name} [control]`, control);
        const mentions = (text: string) =>
          (c.expectOutputIncludes ?? []).every((s) => text.toLowerCase().includes(s.toLowerCase()));
        try {
          if (c.expectFileRead) {
            expect(wasRead(treatment.filesRead, c.expectFileRead), `treatment reads: ${treatment.filesRead.join(", ")}`).toBe(true);
            expect(wasRead(fromControl(control.filesRead), c.expectFileRead), `control reads: ${control.filesRead.join(", ")}`).toBe(false);
          }
          if (c.expectOutputIncludes?.length) {
            expect(mentions(treatment.text), `treatment output:\n${treatment.text}`).toBe(true);
            expect(mentions(control.text), `control output:\n${control.text}`).toBe(false);
          }
        } finally {
          record(`${c.name} [treatment]`, { result: treatment });
          record(`${c.name} [control]`, { result: control });
        }
      }
    });
  }
}
