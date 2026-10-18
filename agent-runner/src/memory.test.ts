import { describe, it, expect } from 'vitest';
import { loadMemory } from './memory.js';
import { RunnerError } from './errors.js';

const reader = (content: string | Error) =>
  ((() => {
    if (content instanceof Error) throw content;
    return content;
  }) as unknown) as typeof import('node:fs').readFileSync;

const enoent = Object.assign(new Error('no such file'), { code: 'ENOENT' });

describe('loadMemory (AC-19)', () => {
  it('returns [] for a missing, empty or whitespace-only file', () => {
    expect(loadMemory('/d', reader(enoent))).toEqual([]);
    expect(loadMemory('/d', reader(''))).toEqual([]);
    expect(loadMemory('/d', reader(' \n\t\n'))).toEqual([]);
  });

  it('parses valid lines and skips blank ones', () => {
    const items = loadMemory(
      '/d',
      reader('{"kind":"c","scope":"repo","content":"a"}\n\n{"kind":"g","scope":"global","content":""}\n'),
    );
    expect(items).toEqual([
      { kind: 'c', scope: 'repo', content: 'a' },
      { kind: 'g', scope: 'global', content: '' },
    ]);
  });

  it('reports the 1-based line number for invalid JSON and schema failures', () => {
    expect(() => loadMemory('/d', reader('{"kind":"c","scope":"repo","content":"a"}\nnot json'))).toThrow(
      /memory\.jsonl line 2: invalid JSON/,
    );
    expect(() => loadMemory('/d', reader('{"kind":"","scope":"repo","content":"a"}'))).toThrow(
      /memory\.jsonl line 1: kind/,
    );
    expect(() => loadMemory('/d', reader('{"kind":"c","scope":"x","content":"a"}'))).toThrow(RunnerError);
  });

  it('wraps non-ENOENT read errors in RunnerError', () => {
    expect(() => loadMemory('/d', reader(Object.assign(new Error('boom'), { code: 'EACCES' })))).toThrow(RunnerError);
  });
});
