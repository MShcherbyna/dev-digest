import { describe, it, expect } from 'vitest';
import { findSecret } from './secrets.js';

const f = (contents: string) => [{ path: '.devdigest/memory.jsonl', contents }];

describe('findSecret (NFR-4)', () => {
  it.each([
    ['github classic token', `x ghp_${'a'.repeat(36)} y`],
    ['github server token', `ghs_${'B'.repeat(40)}`],
    ['fine-grained pat', `github_pat_${'1'.repeat(30)}`],
    ['openai/openrouter style key', `sk-${'z'.repeat(24)}`],
    ['aws access key', 'AKIAABCDEFGHIJKLMNOP'],
  ])('flags %s and returns only the path', (_n, text) => {
    expect(findSecret(f(text))).toBe('.devdigest/memory.jsonl');
  });

  it('passes ordinary text and short sk- words', () => {
    expect(findSecret(f('Use sk-learn style naming; the task-force ran'))).toBeNull();
  });

  it('never returns the matched value', () => {
    const secret = `ghp_${'q'.repeat(36)}`;
    expect(String(findSecret(f(secret)))).not.toContain(secret);
  });
});
