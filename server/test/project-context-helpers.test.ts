/**
 * project-context pure helpers: path validation (AC-28 invalid_path), glob
 * (AC-1/2/3), type/tokens/cap (AC-5/36), merge order (AC-24), used-by (AC-9).
 */
import { describe, it, expect } from 'vitest';
import { validateDocPath } from '../src/modules/project-context/paths.js';
import { compileGlob, resolveGlob } from '../src/modules/project-context/glob.js';
import {
  capAndSort,
  countUsedBy,
  docTypeOf,
  duplicatesOf,
  mergeAttachments,
  tokensFor,
} from '../src/modules/project-context/helpers.js';
import { DEFAULT_DOC_GLOB } from '../src/modules/project-context/constants.js';

describe('validateDocPath', () => {
  it('accepts plain relative .md paths and rejects every invalid_path rule', () => {
    // Catches: a traversal/injection path (or a label-breaking char) passing validation.
    expect(validateDocPath('specs/a.md').ok).toBe(true);
    expect(validateDocPath('.devdigest/specs/c.md').ok).toBe(true);
    const bad = [
      '',
      '   ',
      '/etc/passwd.md',
      'C:/x.md',
      '../x.md',
      'docs/../../etc/passwd.md',
      'docs//a.md',
      'docs\\a.md',
      'docs/a\u0000.md',
      'docs/a\n.md',
      'docs/"a".md',
      "docs/'a'.md",
      'docs/a.txt',
      'docs/a.md/',
    ];
    for (const p of bad) expect(validateDocPath(p).ok, JSON.stringify(p)).toBe(false);
    expect(validateDocPath(undefined).ok).toBe(false);
  });
});

describe('glob', () => {
  const m = (glob: string, path: string) => compileGlob(glob)!.test(path);

  it('default glob matches specs/docs/insights at any depth, including the root, and nothing else', () => {
    // Catches: `**/` not matching zero segments (top-level specs/ would vanish) or INSIGHTS.md leaking in.
    expect(m(DEFAULT_DOC_GLOB, 'specs/a.md')).toBe(true);
    expect(m(DEFAULT_DOC_GLOB, 'server/docs/b.md')).toBe(true);
    expect(m(DEFAULT_DOC_GLOB, '.devdigest/specs/c.md')).toBe(true);
    expect(m(DEFAULT_DOC_GLOB, 'docs/deep/er/x.md')).toBe(true);
    expect(m(DEFAULT_DOC_GLOB, 'INSIGHTS.md')).toBe(false);
    expect(m(DEFAULT_DOC_GLOB, 'README.md')).toBe(false);
    expect(m(DEFAULT_DOC_GLOB, 'docs/a.txt')).toBe(false);
  });

  it('* and ? do not cross a slash; braces expand', () => {
    expect(m('docs/*.md', 'docs/a.md')).toBe(true);
    expect(m('docs/*.md', 'docs/x/a.md')).toBe(false);
    expect(m('docs/?.md', 'docs/ab.md')).toBe(false);
    expect(m('**/adr/**/*.md', 'adr/0001.md')).toBe(true);
  });

  it('AC-3: empty/invalid globs fall back to the default and report the rejected value', () => {
    // Catches: a bad env value silently widening discovery or crashing the container.
    for (const bad of ['', '   ', '/abs/**', '../**/*.md', 'docs/[ab].md', '!docs/*.md', '{a,b', 'a}', 'docs/{a,{b,c}}.md']) {
      const r = resolveGlob(bad);
      expect(r.glob, bad).toBe(DEFAULT_DOC_GLOB);
      expect(r.rejected, bad).toBe(bad);
      expect(r.regex.test('specs/a.md')).toBe(true);
    }
    const ok = resolveGlob('**/adr/**/*.md');
    expect(ok.glob).toBe('**/adr/**/*.md');
    expect(ok.rejected).toBeUndefined();
    expect(resolveGlob(undefined).rejected).toBeUndefined();
  });
});

describe('docTypeOf / tokensFor / capAndSort', () => {
  it('AC-5: type is the deepest specs|docs|insights directory; tokens are ceil(chars/4)', () => {
    // Catches: wrong type for nested dirs; token rule drifting from the studio-wide ceil(chars/4).
    expect(docTypeOf('docs/specs/x.md')).toBe('specs');
    expect(docTypeOf('specs/docs/x.md')).toBe('docs');
    expect(docTypeOf('server/insights/y.md')).toBe('insights');
    expect(tokensFor(0, 'abcde')).toBe(2);
    expect(tokensFor(3 * 1024 * 1024 + 1)).toBe(Math.ceil((3 * 1024 * 1024 + 1) / 4));
  });

  it('AC-36: 2,001 entries are cut to 2,000 sorted by code unit, truncated with the full total', () => {
    // Catches: no cap, locale-sort order, or a wrong total.
    const files = Array.from({ length: 2001 }, (_, i) => ({ path: `docs/f${String(i).padStart(4, '0')}.md` }));
    files.reverse();
    const r = capAndSort(files);
    expect(r.files).toHaveLength(2000);
    expect(r.truncated).toBe(true);
    expect(r.total).toBe(2001);
    expect(r.files[0]!.path).toBe('docs/f0000.md');
    expect(r.files[1999]!.path).toBe('docs/f1999.md');
    expect(capAndSort([{ path: 'b' }, { path: 'B' }]).files.map((f) => f.path)).toEqual(['B', 'b']);
    expect(capAndSort(files.slice(0, 2000)).truncated).toBe(false);
  });
});

describe('mergeAttachments / countUsedBy / duplicatesOf', () => {
  it('AC-24: agent first, then skills in order, first occurrence wins with its origin', () => {
    // Catches: skill docs preceding agent docs, or the duplicate taking the later origin.
    const r = mergeAttachments(
      ['a.md', 'b.md'],
      [
        { name: 'S1', paths: ['b.md', 'c.md'] },
        { name: 'S2', paths: ['c.md', 'd.md'] },
      ],
    );
    expect(r).toEqual([
      { path: 'a.md', origin: 'agent' },
      { path: 'b.md', origin: 'agent' },
      { path: 'c.md', origin: 'skill', skill: 'S1' },
      { path: 'd.md', origin: 'skill', skill: 'S2' },
    ]);
  });

  it('AC-9: counts distinct agents per path (an agent reaching a path twice counts once)', () => {
    // Catches: used-by double counting an agent that attaches directly and via a skill.
    const m = countUsedBy([
      { agentId: 'A', paths: ['x.md'] },
      { agentId: 'A', paths: ['x.md', 'y.md'] },
      { agentId: 'B', paths: ['x.md'] },
    ]);
    expect(m.get('x.md')).toBe(2);
    expect(m.get('y.md')).toBe(1);
    expect(m.get('z.md')).toBeUndefined();
  });

  it('duplicatesOf lists repeated paths once', () => {
    expect(duplicatesOf(['a', 'b', 'a', 'a'])).toEqual(['a']);
  });
});
