import { describe, expect, it } from 'vitest';
import { BusinessError } from './result.js';
import { decodeCursor, encodeCursor, paginate } from './paginate.js';

const all = Array.from({ length: 5 }, (_, i) => i);
const measure = (p: number[]): number => JSON.stringify(p).length;

describe('paginate', () => {
  it('pages through and ends with a null cursor', () => {
    const p1 = paginate({ all, offset: 0, limit: 2, scopeKey: 's', measure });
    expect(p1.items).toEqual([0, 1]);
    expect(p1.nextCursor).not.toBeNull();
    const off = decodeCursor(p1.nextCursor ?? undefined, 's');
    const p3 = paginate({ all, offset: 4, limit: 2, scopeKey: 's', measure });
    expect(off).toBe(2);
    expect(p3.items).toEqual([4]);
    expect(p3.nextCursor).toBeNull();
  });

  it('shrinks a page that exceeds the size cap but keeps one item', () => {
    const big = Array.from({ length: 10 }, () => 'x'.repeat(100));
    const p = paginate({ all: big, offset: 0, limit: 10, scopeKey: 's', measure: (x) => JSON.stringify(x).length, maxChars: 350 });
    expect(p.items.length).toBeLessThan(10);
    expect(p.items.length).toBeGreaterThanOrEqual(1);
    expect(p.nextCursor).not.toBeNull();
  });

  it('rejects invalid and foreign cursors with a business error', () => {
    expect(() => decodeCursor('%%%', 's')).toThrow(BusinessError);
    expect(() => decodeCursor(encodeCursor(2, 'other'), 's')).toThrow(BusinessError);
    expect(() => decodeCursor(Buffer.from('{"o":-1,"k":"s"}').toString('base64url'), 's')).toThrow(BusinessError);
  });

  it('treats a missing cursor as offset 0', () => {
    expect(decodeCursor(undefined, 's')).toBe(0);
  });
});
