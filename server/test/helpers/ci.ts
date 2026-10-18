import type { FastifyInstance } from 'fastify';
import * as t from '../../src/db/schema.js';
import type { Db } from '../../src/db/client.js';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/platform/config.js';
import type { ContainerOverrides } from '../../src/platform/container.js';
import { MockCiGitHub, MockRunnerBundle, MockSecretsProvider } from '../../src/adapters/mocks.js';
import { mergeWorkflow } from '../../src/modules/ci/generator/workflow.js';
import { agentManifestPath, skillPath, MEMORY_PATH, RUNNER_PATH, WORKFLOW_PATH } from '../../src/modules/ci/constants.js';

let seq = 0;

/**
 * App with the CI mocks injected. `secrets` is always overridden: without it the
 * container would read the developer's REAL ~/.devdigest/secrets.json (and a real
 * GITHUB_TOKEN would turn a "no token" test into a live GitHub call).
 */
export async function buildCiApp(
  db: Db,
  gh: MockCiGitHub | null,
  extra: Partial<ContainerOverrides> = {},
): Promise<FastifyInstance> {
  return buildApp({
    config: { ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv), logLevel: 'silent' },
    db,
    overrides: {
      secrets: new MockSecretsProvider({}),
      runnerBundle: new MockRunnerBundle(),
      ...(gh ? { ciGitHub: gh } : {}),
      ...extra,
    },
  });
}

/** A repo connected to the workspace, named uniquely. */
export async function seedCiRepo(db: Db, workspaceId: string, fullName?: string) {
  const n = seq++;
  const name = fullName ?? `acme/ci-${n}`;
  const [owner, repoName] = name.split('/') as [string, string];
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner, name: repoName, fullName: name, defaultBranch: 'main' })
    .returning();
  return { id: repo!.id, fullName: name };
}

export async function newAgent(app: FastifyInstance, name: string, over: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/agents',
    payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'You are a strict reviewer.', ...over },
  });
  if (res.statusCode !== 201) throw new Error(`agent create failed: ${res.body}`);
  return res.json() as { id: string; version: number };
}

export async function linkSkill(
  db: Db,
  workspaceId: string,
  agentId: string,
  name: string,
  body: string,
  order: number,
) {
  const [skill] = await db
    .insert(t.skills)
    .values({ workspaceId, name, description: 'd', type: 'custom', source: 'manual', body })
    .returning();
  await db.insert(t.agentSkills).values({ agentId, skillId: skill!.id, order });
  return skill!.id;
}

export async function addMemory(
  db: Db,
  workspaceId: string,
  repoId: string | null,
  scope: 'repo' | 'global' | 'team',
  content: string,
) {
  await db.insert(t.memory).values({
    workspaceId,
    repoId,
    scope,
    kind: 'fact',
    content,
    embedding: Array.from({ length: 1536 }, () => 0.5),
  });
}

export const previewBody = (repo: string, over: Record<string, unknown> = {}) => ({
  repo,
  target: 'gha',
  triggers: ['opened', 'synchronize'],
  post_as: 'github_review',
  ...over,
});

export const exportBody = (repo: string, over: Record<string, unknown> = {}) => ({
  repo,
  mode: 'pr',
  triggers: ['opened', 'synchronize'],
  post_as: 'github_review',
  ...over,
});

/** Seed an installation row directly (bypassing the export route). */
export async function installDirect(
  db: Db,
  o: { agentId: string; repo: string; slug: string; skillSlugs?: string[]; mode?: 'pr' | 'manual'; manifestVersion?: number },
) {
  const [row] = await db
    .insert(t.ciInstallations)
    .values({
      agentId: o.agentId,
      repo: o.repo,
      targetType: 'gha',
      agentSlug: o.slug,
      mode: o.mode ?? 'pr',
      manifestVersion: o.manifestVersion ?? 1,
      skillSlugs: o.skillSlugs ?? [],
    })
    .returning();
  return row!.id;
}

/** The files an installed agent leaves on a branch, as the exporter writes them. */
export function installedFiles(slug: string, skills: string[] = []): Record<string, string> {
  return {
    [agentManifestPath(slug)]: `name: ${slug}\n`,
    ...Object.fromEntries(skills.map((s) => [skillPath(s), `skill ${s}\n`])),
    [MEMORY_PATH]: '',
    [RUNNER_PATH]: '// runner\n',
  };
}

export function workflowWith(...slugs: string[]): string {
  let text: string | null = null;
  for (const s of slugs) text = mergeWorkflow(text, s, ['opened', 'synchronize'], 'github_review');
  return text!;
}

export { WORKFLOW_PATH };
