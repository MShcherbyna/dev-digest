/**
 * Heading-based Markdown chunker. Pure TypeScript: no imports, no I/O.
 *
 * A document is cut into sections at ATX headings of level 1 to 3 (outside
 * fenced code). A section larger than `maxTokens` is cut at blank-line block
 * boundaries, then hard-split as a last resort. Concatenating the chunk texts
 * reproduces the input exactly; offsets are JS string (UTF-16) indices.
 */

export interface ChunkDraft {
  ordinal: number;
  breadcrumb: string[];
  startOffset: number;
  endOffset: number;
  tokens: number;
  text: string;
}

interface Line {
  start: number;
  end: number;
  /** Content without the line terminator. */
  body: string;
}

interface Section {
  start: number;
  breadcrumb: string[];
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const HEADING = /^ {0,3}(#{1,3})(?:[ \t]+|$)(.*)$/;

const tokensOf = (len: number): number => Math.ceil(len / 4);

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  const re = /[^\n]*\n|[^\n]+$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    lines.push({
      start: m.index,
      end: m.index + raw.length,
      body: raw.replace(/\r?\n$/, ''),
    });
  }
  return lines;
}

function headingText(rest: string): string {
  return rest.replace(/(^|[ \t]+)#+[ \t]*$/, '').trim();
}

const isBlankLine = (l: Line): boolean => l.body.trim().length === 0;

/** Cut a section's lines into blocks; a blank-line run stays with the block before it. */
function toBlocks(lines: Line[]): { start: number; end: number }[] {
  const blocks: { start: number; end: number }[] = [];
  let cur: { start: number; end: number } | null = null;
  let prevBlank = false;
  for (const l of lines) {
    const blank = isBlankLine(l);
    if (cur && prevBlank && !blank) {
      blocks.push(cur);
      cur = null;
    }
    if (!cur) cur = { start: l.start, end: l.end };
    else cur.end = l.end;
    prevBlank = blank;
  }
  if (cur) blocks.push(cur);
  return blocks;
}

/** Slices of at most `maxChars` code units, never cutting between a surrogate pair. */
function hardSplit(text: string, start: number, end: number, maxChars: number): [number, number][] {
  const out: [number, number][] = [];
  let pos = start;
  while (pos < end) {
    let cut = Math.min(pos + maxChars, end);
    if (cut < end) {
      const prev = text.charCodeAt(cut - 1);
      const next = text.charCodeAt(cut);
      const splitsPair = prev >= 0xd800 && prev <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
      if (splitsPair && cut - 1 > pos) cut -= 1;
    }
    out.push([pos, cut]);
    pos = cut;
  }
  return out;
}

export function chunkDocument(text: string, maxTokens = 800): ChunkDraft[] {
  const lines = splitLines(text);
  const sections: Section[] = [{ start: 0, breadcrumb: [] }];
  const stack: { level: number; text: string }[] = [];
  let fence: { char: string; len: number } | null = null;
  let sawHeading = false;

  for (const line of lines) {
    if (fence) {
      const close = FENCE_CLOSE.exec(line.body);
      if (close && close[1]![0] === fence.char && close[1]!.length >= fence.len) fence = null;
      continue;
    }
    const open = FENCE_OPEN.exec(line.body);
    if (open && !(open[1]![0] === '`' && open[2]!.includes('`'))) {
      fence = { char: open[1]![0]!, len: open[1]!.length };
      continue;
    }
    const h = HEADING.exec(line.body);
    if (!h) continue;
    const level = h[1]!.length;
    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
    stack.push({ level, text: headingText(h[2]!) });
    // A blank preamble is not a chunk: its characters join the first section.
    const blankPreamble = !sawHeading && text.slice(0, line.start).trim().length === 0;
    if (blankPreamble) sections.shift();
    sections.push({
      start: blankPreamble ? 0 : line.start,
      breadcrumb: stack.map((s) => s.text),
    });
    sawHeading = true;
  }

  const drafts: ChunkDraft[] = [];
  const emit = (start: number, end: number, breadcrumb: string[]): void => {
    const piece = text.slice(start, end);
    drafts.push({
      ordinal: drafts.length,
      breadcrumb,
      startOffset: start,
      endOffset: end,
      tokens: tokensOf(piece.length),
      text: piece,
    });
  };

  const maxChars = maxTokens * 4;
  sections.forEach((sec, i) => {
    const start = sec.start;
    const end = i + 1 < sections.length ? sections[i + 1]!.start : text.length;
    if (end <= start) return;
    // A blank-only document (no heading) yields no chunk.
    if (!sawHeading && text.trim().length === 0) return;
    if (tokensOf(end - start) <= maxTokens) {
      emit(start, end, sec.breadcrumb);
      return;
    }
    const blocks = toBlocks(lines.filter((l) => l.start >= start && l.end <= end));
    let accStart = -1;
    let accEnd = -1;
    const flush = (): void => {
      if (accStart >= 0) emit(accStart, accEnd, sec.breadcrumb);
      accStart = -1;
    };
    for (const b of blocks) {
      if (accStart >= 0 && tokensOf(b.end - accStart) <= maxTokens) {
        accEnd = b.end;
        continue;
      }
      flush();
      if (tokensOf(b.end - b.start) <= maxTokens) {
        accStart = b.start;
        accEnd = b.end;
        continue;
      }
      for (const [s, e] of hardSplit(text, b.start, b.end, maxChars)) emit(s, e, sec.breadcrumb);
    }
    flush();
  });
  return drafts;
}
