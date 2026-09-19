/* hooks/keys.ts — query-key factories, one entry per cached resource.
   Hooks and invalidations import from here so a key is spelled in exactly one
   place. Keys are generic → specific: `providerModels()` is the prefix of
   `providerModelsFor(provider)`, so invalidating the former hits every provider. */

export const queryKeys = {
  settings: () => ["settings"] as const,
  secretsStatus: () => ["secrets-status"] as const,
  providerModels: () => ["provider-models"] as const,
  providerModelsFor: (provider: string | null | undefined) => ["provider-models", provider] as const,

  repos: () => ["repos"] as const,
  pulls: (repoId: string | null | undefined) => ["pulls", repoId] as const,
  pull: (prId: string | number | null | undefined) => ["pull", prId] as const,
  context: (repoId: string | null | undefined) => ["context", repoId] as const,
  repoIntelState: (repoId: string | null | undefined) => ["repo-intel-state", repoId] as const,

  agents: () => ["agents"] as const,
  agent: (id: string | null | undefined) => ["agent", id] as const,

  skills: () => ["skills"] as const,
  skill: (id: string | null | undefined) => ["skill", id] as const,
  skillVersions: (id: string | null | undefined) => ["skill-versions", id] as const,
  skillStats: (id: string | null | undefined) => ["skill-stats", id] as const,
  agentSkills: (agentId: string | null | undefined) => ["agent-skills", agentId] as const,

  reviews: (prId: string | null | undefined) => ["reviews", prId] as const,
  prRuns: (prId: string | null | undefined) => ["pr-runs", prId] as const,
  prActiveRuns: (prId: string | null | undefined) => ["pr-active-runs", prId] as const,
  prComments: (prId: string | null | undefined) => ["pr-comments", prId] as const,
  runTrace: (runId: string | null | undefined) => ["run-trace", runId] as const,
};
