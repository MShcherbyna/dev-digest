/**
 * Pure heading-based chunker (spec 2026-10-13 AC-5, AC-6). No DB, no fs.
 */
import { describe, it, expect } from 'vitest';
import { chunkDocument } from '../src/modules/project-context/domain/chunking.js';

const joined = (chunks: { text: string }[]) => chunks.map((c) => c.text).join('');

describe('chunkDocument', () => {
  it('AC-5: preamble, #/##/### sections, fenced heading, #### and setext do not split; a 3,500-token section is hard-split', () => {
    // Catches: a heading inside a code fence, a #### or a setext heading starting a chunk;
    // a wrong breadcrumb chain; an oversize chunk; offsets or concatenation drifting from the input.
    const big = 'x'.repeat(14_000); // 3,500 tokens, no blank line to split on
    const doc = [
      'Intro line.\n',
      '\n',
      '# Alpha\n',
      'alpha body\n',
      '```md\n',
      '## not a heading\n',
      '```\n',
      '## Beta\n',
      'beta body\n',
      '### Gamma ###\n', // closing hashes are not part of the breadcrumb
      'gamma body\n',
      '#### Deep\n',
      'deep body\n',
      'Setext\n',
      '======\n',
      'setext body\n',
      '# Omega\n',
      `${big}\n`,
    ].join('');
    const chunks = chunkDocument(doc);

    // Everything before the Omega pieces: exactly five sections, in order.
    const at = (s: string) => doc.indexOf(s);
    const head = chunks.slice(0, 5);
    expect(head.map((c) => [c.ordinal, c.breadcrumb, c.startOffset, c.endOffset])).toEqual([
      [0, [], 0, at('# Alpha')],
      [1, ['Alpha'], at('# Alpha'), at('## Beta')],
      [2, ['Alpha', 'Beta'], at('## Beta'), at('### Gamma')],
      [3, ['Alpha', 'Beta', 'Gamma'], at('### Gamma'), at('# Omega')],
      [4, ['Omega'], at('# Omega'), at('# Omega') + 3200],
    ]);
    expect(head[1]!.text).toContain('## not a heading'); // fenced line stayed in Alpha
    expect(head[3]!.text).toContain('#### Deep');
    expect(head[3]!.text).toContain('Setext\n======');

    // The Omega section: hard-split into <= 800-token pieces that all keep its breadcrumb.
    const omega = chunks.slice(4);
    expect(omega.length).toBeGreaterThan(1);
    expect(omega.every((c) => c.breadcrumb.join('/') === 'Omega')).toBe(true);
    expect(chunks.every((c) => c.tokens <= 800)).toBe(true);
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));

    // Offsets are exact and the pieces reproduce the document.
    for (const c of chunks) {
      expect(doc.slice(c.startOffset, c.endOffset)).toBe(c.text);
      expect(c.tokens).toBe(Math.ceil(c.text.length / 4));
    }
    expect(joined(chunks)).toBe(doc);
  });

  it('AC-5: a document with no level 1-3 heading is one preamble chunk with an empty breadcrumb', () => {
    // Catches: a heading-less document producing no chunks (and so no content in the index).
    const doc = 'just text\n#### deep only\nmore\n';
    expect(chunkDocument(doc)).toEqual([
      { ordinal: 0, breadcrumb: [], startOffset: 0, endOffset: doc.length, tokens: Math.ceil(doc.length / 4), text: doc },
    ]);
  });

  it('AC-5: a whitespace-only preamble is not a chunk; its characters join the first section', () => {
    // Catches: an empty leading chunk, or lost leading characters breaking exact concatenation.
    const doc = '\n  \n# A\nbody\n';
    const chunks = chunkDocument(doc);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ breadcrumb: ['A'], startOffset: 0, endOffset: doc.length, text: doc });
  });

  it('AC-5: fences close only on the same char with at least the opener length; an unclosed fence runs to the end', () => {
    // Catches: a shorter inner fence or a tilde closing a backtick fence, and headings after an unclosed fence splitting.
    const doc = [
      '# A\n',
      '````\n',
      '```\n', // too short to close
      '# fake 1\n',
      '~~~~\n', // other char: does not close
      '# fake 2\n',
      '````\n', // closes
      '## B\n',
      '~~~\n',
      '## fake 3\n', // never closed
      '# fake 4\n',
    ].join('');
    const chunks = chunkDocument(doc);
    expect(chunks.map((c) => c.breadcrumb)).toEqual([['A'], ['A', 'B']]);
    expect(chunks[1]!.text).toContain('# fake 4');
    expect(joined(chunks)).toBe(doc);
  });

  it('AC-5: an oversize section is cut at blank-line boundaries and consecutive blocks are packed up to 800 tokens', () => {
    // Catches: splitting mid-paragraph when a blank line is available, or not packing small blocks together.
    const para = `${'p'.repeat(999)}\n\n`; // 1,001 chars
    const doc = `# H\n${para.repeat(4)}`; // 1,002 tokens in total
    const chunks = chunkDocument(doc);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.text).toBe(`# H\n${para.repeat(3)}`); // 752 tokens: three blocks packed
    expect(chunks[0]!.text.endsWith('\n\n')).toBe(true);
    expect(chunks[1]!.text).toBe(para);
    expect(chunks.every((c) => c.breadcrumb.join('/') === 'H')).toBe(true);
    expect(joined(chunks)).toBe(doc);
  });

  it('AC-5: a hard split never cuts between the two halves of a surrogate pair', () => {
    // Catches: a split emoji becoming two lone surrogates (invalid UTF-8 text stored and hashed).
    const doc = `${'a'.repeat(7)}😀${'b'.repeat(10)}`; // the pair sits across the 8-char cut
    const chunks = chunkDocument(doc, 2); // maxChars = 8
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text).not.toMatch(/[\ud800-\udbff]$/);
      expect(c.text).not.toMatch(/^[\udc00-\udfff]/);
      expect(c.tokens).toBeLessThanOrEqual(2);
    }
    expect(joined(chunks)).toBe(doc);
  });

  it('AC-5: CRLF documents keep exact offsets and headings are still detected', () => {
    // Catches: "\r" leaking into breadcrumbs or shifting offsets by one per line.
    const doc = 'pre\r\n# A\r\nbody\r\n## B\r\nx\r\n';
    const chunks = chunkDocument(doc);
    expect(chunks.map((c) => c.breadcrumb)).toEqual([[], ['A'], ['A', 'B']]);
    for (const c of chunks) expect(doc.slice(c.startOffset, c.endOffset)).toBe(c.text);
    expect(joined(chunks)).toBe(doc);
  });

  it('AC-6: chunking the same input twice gives identical output', () => {
    // Catches: nondeterminism that would make unchanged files get new chunk hashes on every re-index.
    const doc = `# A\n${'word '.repeat(2000)}\n\n## B\ntext\n`;
    expect(chunkDocument(doc)).toEqual(chunkDocument(doc));
  });
});
