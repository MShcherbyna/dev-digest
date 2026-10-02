import { describe, expect, it } from 'vitest';
import { businessError, ok } from './result.js';

describe('result helpers', () => {
  it('ok duplicates structuredContent as compact JSON text', () => {
    const r = ok({ a: 1, b: [2] });
    expect(r.content[0]).toEqual({ type: 'text', text: JSON.stringify(r.structuredContent) });
    expect(r.isError).toBeUndefined();
  });

  it('businessError carries all four parts and no structuredContent', () => {
    const r = businessError({ what: 'Bad thing.', expected: 'a', example: 'b', next: 'c' });
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toBeUndefined();
    const first = r.content[0];
    expect(first && first.type === 'text' ? first.text : '').toBe(
      'Bad thing. Expected: a. Example: b. Next: c.',
    );
  });
});
