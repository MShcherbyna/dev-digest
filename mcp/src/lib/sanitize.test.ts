import { describe, expect, it } from 'vitest';
import { sanitizeText } from './sanitize.js';

describe('sanitizeText', () => {
  it('strips ANSI sequences and control characters but keeps newlines and tabs', () => {
    expect(sanitizeText('\u001b[31mred\u001b[0m\u0000 a\tb\nc\u0007', 100)).toBe('red a\tb\nc');
  });

  it('strips OSC sequences', () => {
    expect(sanitizeText('x\u001b]0;title\u0007y', 100)).toBe('xy');
  });

  it('truncates with an ellipsis', () => {
    expect(sanitizeText('abcdefghij', 5)).toBe('abcd…');
    expect(sanitizeText('abc', 5)).toBe('abc');
  });
});
