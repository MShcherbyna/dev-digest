import type { AgentConfigs } from './ports.js';

/**
 * What the `AgentConfigs` adapter needs from the agents side. Generic over the
 * agent row `A` and the version config `V` so this module never imports the
 * agents module; the container supplies the concrete lookups.
 */
export interface AgentConfigLookup<A, V> {
  getAgent(workspaceId: string, agentId: string): Promise<A | undefined>;
  /** The recorded config of `version`, or `undefined` when it was never recorded / unreadable. */
  getVersionConfig(agentId: string, version: number): Promise<V | undefined>;
  isSame(versionConfig: V, agent: A): boolean;
}

/** `AgentConfigs` over an agent lookup: `available` = snapshot exists, `current` = equals live config. */
export function createAgentConfigs<A, V>(lookup: AgentConfigLookup<A, V>): AgentConfigs {
  return {
    async isCurrentConfig(workspaceId, agentId, version) {
      const agent = await lookup.getAgent(workspaceId, agentId);
      if (!agent) return { available: false, current: false };
      const config = await lookup.getVersionConfig(agentId, version);
      if (!config) return { available: false, current: false };
      return { available: true, current: lookup.isSame(config, agent) };
    },
  };
}
