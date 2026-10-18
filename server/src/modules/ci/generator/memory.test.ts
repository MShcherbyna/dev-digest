import { describe, it, expect } from 'vitest';
import { renderMemory } from './memory.js';

describe('renderMemory (AC-7)', () => {
  it('is empty for no items', () => {
    expect(renderMemory([])).toBe('');
  });

  it('writes one {kind, scope, content} object per line and nothing else', () => {
    const noisy = { kind: 'fact', scope: 'repo', content: 'a\nb', embedding: [0.1], id: 'x', sources: [] };
    const text = renderMemory([noisy as never, { kind: 'decision', scope: 'global', content: 'c' }]);
    const lines = text.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual({ kind: 'fact', scope: 'repo', content: 'a\nb' });
    expect(text).not.toContain('embedding');
    expect(text.endsWith('\n')).toBe(true);
  });
});
