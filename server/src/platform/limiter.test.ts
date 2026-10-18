import { describe, it, expect, vi } from 'vitest';
import { createLimiter } from './limiter.js';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('createLimiter', () => {
  it('never runs more than `max` concurrent tasks', async () => {
    const limiter = createLimiter(2);
    let active = 0;
    let maxActive = 0;
    const gates = Array.from({ length: 5 }, () => deferred<void>());

    const tasks = gates.map((gate, i) =>
      limiter.run(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await gate.promise;
        active--;
        return i;
      }),
    );

    // Let the microtask queue settle so the first `max` tasks have started.
    await new Promise((r) => setTimeout(r, 0));
    expect(limiter.active).toBe(2);
    expect(maxActive).toBeLessThanOrEqual(2);

    for (const gate of gates) {
      gate.resolve();
      await new Promise((r) => setTimeout(r, 0));
    }

    const results = await Promise.all(tasks);
    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('runs queued tasks in FIFO order', async () => {
    const limiter = createLimiter(1);
    const order: number[] = [];
    const tasks = [0, 1, 2, 3].map((i) =>
      limiter.run(async () => {
        order.push(i);
      }),
    );
    await Promise.all(tasks);
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it('frees its slot when a task rejects', async () => {
    const limiter = createLimiter(1);
    const first = limiter.run(async () => {
      throw new Error('boom');
    });
    await expect(first).rejects.toThrow('boom');

    const second = vi.fn(async () => 'ok');
    const result = await limiter.run(second);
    expect(result).toBe('ok');
    expect(second).toHaveBeenCalledTimes(1);
    expect(limiter.active).toBe(0);
  });
});
