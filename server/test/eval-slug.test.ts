import { describe, it, expect } from 'vitest';
import { slugify } from '../src/modules/eval/domain/slug.js';
import { SLUG_MAX } from '../src/modules/eval/constants.js';

describe('eval slugify', () => {
  it('kebab-cases a title: lowercases, collapses separators, trims dashes', () => {
    // Regression: case names derived from finding titles must be stable, URL-safe slugs.
    expect(slugify('Hardcoded Stripe secret key')).toBe('hardcoded-stripe-secret-key');
    expect(slugify('  --SQL   injection!!  in `query()` -- ')).toBe('sql-injection-in-query');
  });

  it('keeps ASCII only (accents folded, non-latin dropped) and falls back to "case" when nothing remains', () => {
    // Regression: an all-non-ASCII or punctuation-only title must not yield an empty case name.
    expect(slugify('Café résumé')).toBe('cafe-resume');
    expect(slugify('Привіт світ')).toBe('case');
    expect(slugify('!!! ???')).toBe('case');
    expect(slugify('')).toBe('case');
  });

  it(`caps at ${SLUG_MAX} chars, cutting at a dash boundary when possible`, () => {
    // Regression: long titles must not exceed the name budget or end mid-word / with a dash.
    const words = Array.from({ length: 20 }, () => 'abcdef').join(' ');
    const out = slugify(words);
    expect(out.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(out.endsWith('-')).toBe(false);
    expect(out).toBe(Array.from({ length: 8 }, () => 'abcdef').join('-')); // 8*6+7 = 55 <= 60

    // One unbroken word longer than the cap is hard-cut.
    expect(slugify('x'.repeat(100))).toBe('x'.repeat(SLUG_MAX));
    // Exactly at the cap with a following dash keeps the whole word.
    expect(slugify(`${'y'.repeat(SLUG_MAX)} tail`)).toBe('y'.repeat(SLUG_MAX));
  });
});
