import { describe, it, expect } from 'vitest';
import { isReusable, sourceHash } from '../src/modules/translation/helpers.js';
import type { SourceFinding, TranslationRecord } from '../src/modules/translation/ports.js';

const source: SourceFinding = {
  id: 'f1',
  title: 'Hardcoded key',
  rationale: 'A key is committed.',
  suggestion: 'Use an env var.',
};
const choice = { provider: 'openrouter', model: 'm1' } as const;
const stored = (over: Partial<TranslationRecord> = {}): TranslationRecord => ({
  findingId: 'f1',
  language: 'uk',
  provider: 'openrouter',
  model: 'm1',
  sourceHash: sourceHash(source),
  title: 't',
  rationale: 'r',
  suggestion: 's',
  tokensIn: null,
  tokensOut: null,
  costUsd: null,
  translatedAt: new Date(),
  ...over,
});

describe('sourceHash', () => {
  it('is stable and changes with any translated field', () => {
    expect(sourceHash(source)).toBe(sourceHash({ ...source }));
    expect(sourceHash({ ...source, title: 'x' })).not.toBe(sourceHash(source));
    expect(sourceHash({ ...source, rationale: 'x' })).not.toBe(sourceHash(source));
    expect(sourceHash({ ...source, suggestion: null })).not.toBe(sourceHash(source));
  });
  it('does not confuse fields that concatenate to the same text', () => {
    expect(sourceHash({ ...source, title: 'ab', rationale: 'c' })).not.toBe(
      sourceHash({ ...source, title: 'a', rationale: 'bc' }),
    );
  });
});

describe('isReusable', () => {
  it('reuses a row with the same language, model and source', () => {
    expect(isReusable(stored(), source, 'uk', choice)).toBe(true);
  });
  it('rejects a missing row', () => {
    expect(isReusable(undefined, source, 'uk', choice)).toBe(false);
  });
  it('rejects a different language, provider or model', () => {
    expect(isReusable(stored(), source, 'ru', choice)).toBe(false);
    expect(isReusable(stored({ provider: 'openai' }), source, 'uk', choice)).toBe(false);
    expect(isReusable(stored({ model: 'm2' }), source, 'uk', choice)).toBe(false);
  });
  it('rejects when the finding text changed', () => {
    expect(isReusable(stored(), { ...source, title: 'Changed' }, 'uk', choice)).toBe(false);
  });
  it('treats a failed model lookup as not reusable', () => {
    expect(isReusable(stored(), source, 'uk', undefined)).toBe(false);
  });
});
