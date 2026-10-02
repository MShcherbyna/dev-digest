import { describe, expect, it } from 'vitest';
import { InflightTracker } from './inflight.js';

describe('InflightTracker', () => {
  it('drains immediately when idle', async () => {
    expect(await new InflightTracker().drain(50)).toBe(true);
  });

  it('waits for in-flight work to settle (incl. rejections)', async () => {
    const t = new InflightTracker();
    t.track(new Promise((r) => setTimeout(r, 30)));
    t.track(Promise.reject(new Error('x')).catch(() => { throw new Error('y'); }));
    expect(await t.drain(1000)).toBe(true);
    expect(t.size).toBe(0);
  });

  it('gives up after the bound', async () => {
    const t = new InflightTracker();
    t.track(new Promise(() => {}));
    const start = Date.now();
    expect(await t.drain(60)).toBe(false);
    expect(Date.now() - start).toBeLessThan(500);
  });
});
