import { stringify } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import { AppError } from '../../../platform/errors.js';
import type { CiAgent } from '../ports.js';

export interface GeneratedManifest {
  yaml: string;
  manifest: AgentManifest;
  /** The OpenRouter id when the agent's own provider was mapped (AC-6), else null. */
  openrouterId: string | null;
}

/**
 * AC-5/AC-6: build the manifest the runner reads. openai/anthropic agents run
 * through OpenRouter as `<provider>/<model>`; an openrouter agent is kept as is.
 * The result is checked with the SAME shared schema the runner uses.
 */
export function buildManifest(agent: CiAgent, skillSlugs: string[]): GeneratedManifest {
  const mapped = agent.provider !== 'openrouter';
  const model = mapped ? `${agent.provider}/${agent.model}` : agent.model;
  const candidate = {
    name: agent.name,
    provider: 'openrouter',
    model,
    system_prompt: agent.systemPrompt,
    skills: skillSlugs,
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
    manifest_version: agent.version,
    agent_id: agent.id,
  };
  const parsed = AgentManifest.safeParse(candidate);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(root)'))];
    throw new AppError('manifest_invalid', 'The agent cannot be exported as a valid manifest', 422, { fields });
  }
  return {
    yaml: stringify(candidate, { lineWidth: 0 }),
    manifest: parsed.data,
    openrouterId: mapped ? model : null,
  };
}
