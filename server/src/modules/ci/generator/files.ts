import type { CiFile } from '@devdigest/shared';
import { MEMORY_PATH, RUNNER_PATH, WORKFLOW_PATH, agentManifestPath, skillPath } from '../constants.js';
import { agentSlug, assignSkillSlugs } from '../domain/slug.js';
import type { CiAgent, CiSkill, MemoryExportItem } from '../ports.js';
import { buildManifest } from './manifest.js';
import { renderMemory } from './memory.js';

export interface FileBundleInput {
  agent: CiAgent;
  skills: CiSkill[];
  memory: MemoryExportItem[];
  runner: string;
}

export interface FileBundle {
  agentSlug: string;
  skillSlugs: string[];
  manifestVersion: number;
  openrouterId: string | null;
  /** Everything except the workflow (it depends on the existing repo state). */
  files: CiFile[];
}

/** Build every generated file except the workflow. Paths come only from constants and slugs. */
export function buildFileBundle(input: FileBundleInput): FileBundle {
  const slug = agentSlug(input.agent.name);
  const skillSlugs = assignSkillSlugs(input.skills.map((s) => s.name));
  const manifest = buildManifest(input.agent, skillSlugs);
  const files: CiFile[] = [
    { path: agentManifestPath(slug), contents: manifest.yaml, editable: false },
    ...input.skills.map((s, i) => ({ path: skillPath(skillSlugs[i]!), contents: s.body, editable: false })),
    { path: MEMORY_PATH, contents: renderMemory(input.memory), editable: false },
    { path: RUNNER_PATH, contents: input.runner, editable: false },
  ];
  return {
    agentSlug: slug,
    skillSlugs,
    manifestVersion: input.agent.version,
    openrouterId: manifest.openrouterId,
    files,
  };
}

/** AC-4 order: manifest, skills, memory, runner, then the editable workflow. */
export function withWorkflow(bundle: FileBundle, workflow: string): CiFile[] {
  return [...bundle.files, { path: WORKFLOW_PATH, contents: workflow, editable: true }];
}
