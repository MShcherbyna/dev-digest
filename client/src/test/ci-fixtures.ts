import type { Agent, CiInstallation, CiPreview, CiRun } from "@devdigest/shared";

export const AGENT: Agent = {
  id: "ag1", name: "Security Reviewer", description: "", provider: "openai", model: "gpt-4.1",
  system_prompt: "p", output_schema: null, strategy: "single-pass", ci_fail_on: "critical",
  repo_intel: true, enabled: true, version: 2,
};

export const installation = (o: Partial<CiInstallation> = {}): CiInstallation => ({
  id: "i1", agent_id: "ag1", repo: "acme/api", target_type: "gha", installed_at: "2026-10-01T00:00:00Z",
  agent_slug: "security-reviewer", mode: "pr", status: "active", manifest_version: 2, post_as: "github_review",
  triggers: ["opened", "synchronize"], pr_url: null, removal_pr_url: null, last_run_at: null, last_run_status: null, ...o,
});

export const ciRun = (o: Partial<CiRun> = {}): CiRun => ({
  id: "r1", ci_installation_id: "i1", pr_number: 12, ran_at: "2026-10-01T10:00:00Z", status: "succeeded",
  findings_count: 3, cost_usd: 0.07, github_url: null, source: "ci", agent: "Security Reviewer", duration_s: null,
  repo: "acme/api", pr_title: "Add rate limit", verdict: "request_changes", critical: 2, warning: 1, suggestion: 0,
  job_url: "https://github.com/acme/api/actions/runs/1", agent_id: "ag1", agent_slug: "security-reviewer",
  github_run_id: "1", duration_ms: 7400, agent_run_id: null, ...o,
});

export const PREVIEW: CiPreview = {
  files: [
    { path: ".devdigest/agents/security-reviewer.yaml", contents: "name: x", editable: false },
    { path: ".devdigest/memory.jsonl", contents: "", editable: false },
    { path: ".devdigest/runner/index.js", contents: "// runner", editable: false },
    { path: ".github/workflows/devdigest-review.yml", contents: "name: DevDigest Review\non: pull_request\n", editable: true },
  ],
  secrets: [{ name: "OPENROUTER_API_KEY", status: "not_set" }, { name: "GITHUB_TOKEN", status: "ready" }],
  notes: [{ kind: "openrouter_id", id: "openai/gpt-4.1" }],
  agent_slug: "security-reviewer", manifest_version: 2, install_block: null, pr_open: false,
};
