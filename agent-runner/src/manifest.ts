import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import { RunnerError } from './errors.js';

/**
 * Loads and VALIDATES the checked-in `.devdigest/agents/<slug>.yaml` manifest
 * (AC-20). The manifest is written by the studio's export flow
 * (`server/src/modules/ci/manifest.ts`) and is otherwise untrusted on-disk
 * content by the time it reaches CI — it is schema-validated with the same
 * `AgentManifest` Zod contract before any of its fields (system prompt, model,
 * ci_fail_on) are used to build a review. Fail clearly (a descriptive
 * `RunnerError`) rather than silently defaulting or partially trusting it.
 */

export type { AgentManifest } from '@devdigest/shared';

export interface FsDeps {
  readFile?: typeof readFileSync;
  readDir?: typeof readdirSync;
}

/** Find the single agent manifest file under `<devdigestDir>/agents/` (no `DEVDIGEST_AGENT`). */
export function findManifestPath(devdigestDir: string, deps: FsDeps = {}): string {
  const readDir = deps.readDir ?? readdirSync;
  const agentsDir = path.join(devdigestDir, 'agents');
  let entries: string[];
  try {
    entries = readDir(agentsDir) as unknown as string[];
  } catch (err) {
    throw new RunnerError(
      `Agent manifest directory not found: ${agentsDir} (${(err as Error).message})`,
    );
  }
  const yamlFiles = entries.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  if (yamlFiles.length === 0) {
    throw new RunnerError(`No agent manifest (*.yaml) found in ${agentsDir}`);
  }
  if (yamlFiles.length > 1) {
    throw new RunnerError(
      `Expected exactly one agent manifest in ${agentsDir}, found ${yamlFiles.length}: ${yamlFiles.join(', ')}; set DEVDIGEST_AGENT to pick one`,
    );
  }
  return path.join(agentsDir, yamlFiles[0]!);
}

/** Read, parse, and Zod-validate the manifest at `manifestPath` (AC-20). */
export function loadAgentManifest(manifestPath: string, deps: FsDeps = {}): AgentManifest {
  const readFile = deps.readFile ?? readFileSync;
  let raw: string;
  try {
    raw = readFile(manifestPath, 'utf8') as unknown as string;
  } catch (err) {
    throw new RunnerError(
      `Cannot read agent manifest at ${manifestPath}: ${(err as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new RunnerError(
      `Agent manifest at ${manifestPath} is not valid YAML: ${(err as Error).message}`,
    );
  }

  const result = AgentManifest.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new RunnerError(`Agent manifest at ${manifestPath} failed validation: ${issues}`);
  }
  return result.data;
}

/** Convenience: locate + load + validate in one call. */
export function loadManifest(devdigestDir: string, deps: FsDeps = {}): AgentManifest {
  const manifestPath = findManifestPath(devdigestDir, deps);
  return loadAgentManifest(manifestPath, deps);
}

/** AC-32 agent slug: kebab-case ASCII. Also keeps `DEVDIGEST_AGENT` from escaping `agents/`. */
const AGENT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Locate + load + validate the manifest this job reviews with, and return its
 * slug (the file name without its extension).
 *
 * D-MA-1 / AC-18: with `selected` (the workflow's `DEVDIGEST_AGENT`) only
 * `agents/<selected>.yaml` is read, so other agents' manifests in the same
 * directory never cause a failure. Without it, exactly one manifest must exist
 * (a hand-written single-agent setup).
 */
export function loadManifestWithSlug(
  devdigestDir: string,
  deps: FsDeps = {},
  selected?: string,
): { manifest: AgentManifest; slug: string } {
  if (selected) {
    if (!AGENT_SLUG.test(selected)) {
      throw new RunnerError(`DEVDIGEST_AGENT '${selected}' is not a valid agent slug (kebab-case ASCII)`);
    }
    const manifestPath = path.join(devdigestDir, 'agents', `${selected}.yaml`);
    return { manifest: loadAgentManifest(manifestPath, deps), slug: selected };
  }
  const manifestPath = findManifestPath(devdigestDir, deps);
  const slug = path.basename(manifestPath, path.extname(manifestPath));
  return { manifest: loadAgentManifest(manifestPath, deps), slug };
}
