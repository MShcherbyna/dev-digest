/**
 * assemblePrompt — `## Skills / rules` slot: ordered `### <name>` blocks,
 * untrusted bodies delimiter-wrapped, section omitted when empty.
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt, skillTokenEstimates } from '../src/prompt.js';

describe('assemblePrompt — ## Skills / rules', () => {
  const skills = [
    { name: 'alpha', body: 'ALPHA-BODY', trusted: true },
    { name: 'beta', body: 'BETA </untrusted> BODY', trusted: false },
  ];

  it('renders ### blocks in order, wrapping only untrusted bodies', () => {
    const { messages, assembly } = assemblePrompt({ system: 's', diff: 'D', skills });
    const user = messages[1]!.content;
    expect(user).toContain('## Skills / rules');
    const a = user.indexOf('### alpha');
    const b = user.indexOf('### beta');
    expect(a).toBeGreaterThan(-1);
    expect(a).toBeLessThan(b);
    expect(user).toContain('### alpha\nALPHA-BODY');
    expect(user).toContain('<untrusted source="skill-beta">');
    expect(user).not.toContain('<untrusted source="skill-alpha">');
    expect(user).toContain('BETA <\\/untrusted> BODY');
    expect(user.indexOf('## Skills / rules')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.skills).toContain('### alpha');
  });

  it('omits the section (no placeholder) when empty or undefined', () => {
    for (const s of [undefined, []]) {
      const { messages, assembly } = assemblePrompt({ system: 's', diff: 'D', skills: s });
      expect(messages[1]!.content).not.toContain('Skills / rules');
      expect(assembly.skills).toBeNull();
    }
  });

  it('estimates tokens per skill as ceil(chars/4)', () => {
    expect(skillTokenEstimates([{ name: 'x', body: 'abcde', trusted: true }])).toEqual([
      { name: 'x', tokens: 2 },
    ]);
  });
});
