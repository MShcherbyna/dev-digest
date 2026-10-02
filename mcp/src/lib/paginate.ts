import { z } from 'zod';
import { BusinessError } from './result.js';

export const MAX_RESPONSE_CHARS = 16_000;

const CursorPayload = z.object({ o: z.number().int().min(0), k: z.string() });

export function encodeCursor(offset: number, scopeKey: string): string {
  return Buffer.from(JSON.stringify({ o: offset, k: scopeKey }), 'utf8').toString('base64url');
}

const invalidCursor = (): BusinessError =>
  new BusinessError({
    what: 'Cursor is invalid or from another result',
    expected: 'the next_cursor value from the previous call of the same tool and arguments',
    example: 'cursor: "<next_cursor from the last response>"',
    next: 'omit cursor to restart from page 1',
  });

/** Returns the offset encoded in `cursor`, or 0 when absent. Throws BusinessError on junk/foreign cursors. */
export function decodeCursor(cursor: string | undefined, scopeKey: string): number {
  if (cursor === undefined || cursor === '') return 0;
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  const parsed = CursorPayload.safeParse(raw);
  if (!parsed.success || parsed.data.k !== scopeKey) throw invalidCursor();
  return parsed.data.o;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Slices `all` from `offset` by `limit`, then shrinks the page until
 * `measure(page)` fits in `maxChars` (always keeps at least one item).
 */
export function paginate<T>(opts: {
  all: readonly T[];
  offset: number;
  limit: number;
  scopeKey: string;
  measure: (page: T[]) => number;
  maxChars?: number;
}): Page<T> {
  const maxChars = opts.maxChars ?? MAX_RESPONSE_CHARS;
  let page = opts.all.slice(opts.offset, opts.offset + opts.limit);
  while (page.length > 1 && opts.measure(page) > maxChars) {
    page = page.slice(0, Math.max(1, Math.floor(page.length * 0.75)));
  }
  const end = opts.offset + page.length;
  return { items: page, nextCursor: end < opts.all.length ? encodeCursor(end, opts.scopeKey) : null };
}
