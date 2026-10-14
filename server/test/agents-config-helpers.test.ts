import { describe, it, expect } from 'vitest';
import type { AgentVersionConfig } from '@devdigest/shared';
import { sameAgentConfig } from '../src/modules/agents/helpers.js';

const config: AgentVersionConfig = {
  provider: 'openai',
  model: 'gpt-4.1',
  system_prompt: 'Review.',
  output_schema: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'number' } } },
  strategy: 'auto',
  ci_fail_on: 'critical',
  repo_intel: true,
  skills: ['skill-a'],
};

const agent = {
  provider: config.provider,
  model: config.model,
  systemPrompt: config.system_prompt,
  outputSchema: { type: 'object', properties: { b: { type: 'number' }, a: { type: 'string' } } },
  strategy: config.strategy,
  ciFailOn: config.ci_fail_on,
  repoIntel: config.repo_intel,
};

describe('sameAgentConfig', () => {
  it('is true for equal configs; output_schema compares deep (key order irrelevant); skills are ignored', () => {
    // Regression: promote must answer 409 identical only for a truly equal config, not on skills / key order.
    expect(sameAgentConfig(config, agent as never)).toBe(true);
    expect(sameAgentConfig({ ...config, skills: ['other'] }, agent as never)).toBe(true);
  });

  it('is false when any compared field differs', () => {
    // Regression: a changed field must allow the promote; each of the seven fields counts.
    const diffs: Array<Record<string, unknown>> = [
      { provider: 'openrouter' },
      { model: 'gpt-4o' },
      { systemPrompt: 'Other.' },
      { outputSchema: { type: 'array' } },
      { strategy: 'map-reduce' },
      { ciFailOn: 'never' },
      { repoIntel: false },
    ];
    for (const d of diffs) {
      expect(sameAgentConfig(config, { ...agent, ...d } as never), JSON.stringify(d)).toBe(false);
    }
  });

  it('output_schema is null-safe: undefined equals null, but null differs from a schema', () => {
    // Regression: a version without a schema (undefined) must equal an agent whose column is null.
    const noSchema = { ...config, output_schema: undefined };
    expect(sameAgentConfig(noSchema, { ...agent, outputSchema: null } as never)).toBe(true);
    expect(sameAgentConfig({ ...config, output_schema: null }, { ...agent, outputSchema: undefined } as never)).toBe(true);
    expect(sameAgentConfig(noSchema, agent as never)).toBe(false);
  });
});
