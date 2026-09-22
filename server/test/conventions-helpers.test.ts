import { describe, it, expect } from 'vitest';
import {
  buildSkillBody,
  defaultSkillMeta,
  isSafeRelativePath,
  numberLines,
  verifyEvidence,
} from '../src/modules/conventions/helpers.js';
import type { ConventionRow } from '../src/modules/conventions/repository.js';

const file = ['import x from "x";', '', '@Entity("orders")', 'export class Order {}', '  '].join('\n');

describe('conventions helpers', () => {
  it('numberLines prefixes 1-based line numbers', () => {
    expect(numberLines('a\nb')).toBe('1: a\n2: b');
  });

  it('verifyEvidence accepts a real line and returns a snippet', () => {
    expect(verifyEvidence(file, 3, '@Entity("orders")')).toEqual({
      line: 3,
      snippet: '@Entity("orders")\nexport class Order {}',
    });
  });

  it('verifyEvidence corrects a slightly wrong line number', () => {
    expect(verifyEvidence(file, 2, '@Entity("orders")')?.line).toBe(3);
  });

  it('verifyEvidence drops out-of-range, blank and unfindable evidence', () => {
    expect(verifyEvidence(file, 99)).toBeNull();
    expect(verifyEvidence(file, 2)).toBeNull();
    expect(verifyEvidence(file, 1, 'not in the file')).toBeNull();
  });

  it('isSafeRelativePath rejects traversal and absolute paths', () => {
    expect(isSafeRelativePath('src/a.ts')).toBe(true);
    expect(isSafeRelativePath('../etc/passwd')).toBe(false);
    expect(isSafeRelativePath('a/../../b')).toBe(false);
    expect(isSafeRelativePath('/etc/passwd')).toBe(false);
  });

  it('buildSkillBody lists rules with evidence; defaultSkillMeta names by repo', () => {
    const rows = [
      { rule: 'Use kebab-case', evidencePath: 'src/a-b.ts', evidenceLine: 4 },
      { rule: 'No evidence rule', evidencePath: null, evidenceLine: null },
    ] as ConventionRow[];
    const body = buildSkillBody(rows);
    expect(body).toContain('- Use kebab-case\n  - evidence: `src/a-b.ts#L4`');
    expect(body).toContain('- No evidence rule');
    expect(defaultSkillMeta('acme/shop', 3)).toEqual({
      name: 'shop-conventions',
      description: '3 house conventions extracted from shop',
    });
  });
});
