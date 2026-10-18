import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import { buildManifest } from './manifest.js';
import type { CiAgent } from '../ports.js';

const agent = (over: Partial<CiAgent> = {}): CiAgent => ({
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Security Reviewer',
  provider: 'openai',
  model: 'gpt-4.1',
  systemPrompt: 'You are strict.\n\nLine two: "quoted" # not a comment\n',
  strategy: 'single-pass',
  ciFailOn: 'critical',
  version: 4,
  ...over,
});

describe('buildManifest (AC-5, AC-6)', () => {
  it('round-trips through the runner path: yaml.parse + AgentManifest.parse', () => {
    const { yaml } = buildManifest(agent(), ['naming', 'naming-2']);
    const parsed = AgentManifest.parse(parse(yaml));
    expect(parsed).toMatchObject({
      name: 'Security Reviewer',
      provider: 'openrouter',
      model: 'openai/gpt-4.1',
      skills: ['naming', 'naming-2'],
      strategy: 'single-pass',
      ci_fail_on: 'critical',
      manifest_version: 4,
      agent_id: '11111111-1111-1111-1111-111111111111',
    });
    expect(parsed.system_prompt).toBe(agent().systemPrompt);
  });

  it.each([
    ['openai', 'gpt-4.1', 'openai/gpt-4.1', 'openai/gpt-4.1'],
    ['anthropic', 'claude-sonnet-4', 'anthropic/claude-sonnet-4', 'anthropic/claude-sonnet-4'],
    ['openrouter', 'deepseek/deepseek-v4', 'deepseek/deepseek-v4', null],
  ] as const)('maps provider %s', (provider, model, expectedModel, id) => {
    const out = buildManifest(agent({ provider, model }), []);
    expect(out.manifest.provider).toBe('openrouter');
    expect(out.manifest.model).toBe(expectedModel);
    expect(out.openrouterId).toBe(id);
  });

  it('rejects an invalid manifest with manifest_invalid and the failing fields', () => {
    expect.assertions(2);
    try {
      buildManifest(agent({ model: '', provider: 'openrouter' }), []);
    } catch (err) {
      expect((err as { code: string }).code).toBe('manifest_invalid');
      expect((err as { details: { fields: string[] } }).details.fields).toContain('model');
    }
  });
});
