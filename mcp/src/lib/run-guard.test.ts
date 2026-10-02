import { describe, expect, it } from 'vitest';
import { BusinessError } from './result.js';
import { RunGuard } from './run-guard.js';

describe('RunGuard', () => {
  it('blocks after maxRuns and frees up after the window', () => {
    let t = 0;
    const g = new RunGuard({ maxRuns: 2, windowMs: 1000, now: () => t });
    g.assertCanStart();
    g.recordStart();
    g.assertCanStart();
    g.recordStart();
    expect(() => g.assertCanStart()).toThrow(BusinessError);
    t = 1001;
    expect(() => g.assertCanStart()).not.toThrow();
  });

  it('serializes work for the same key', async () => {
    const g = new RunGuard({ maxRuns: 5, windowMs: 1000 });
    const order: string[] = [];
    const a = g.withLock('k', async () => {
      order.push('a-start');
      await new Promise((r) => setTimeout(r, 20));
      order.push('a-end');
    });
    const b = g.withLock('k', async () => {
      order.push('b-start');
    });
    await Promise.all([a, b]);
    expect(order).toEqual(['a-start', 'a-end', 'b-start']);
  });

  it('keeps the lock chain alive after a failure', async () => {
    const g = new RunGuard({ maxRuns: 5, windowMs: 1000 });
    await expect(g.withLock('k', async () => { throw new Error('x'); })).rejects.toThrow('x');
    await expect(g.withLock('k', async () => 'ok')).resolves.toBe('ok');
  });
});
