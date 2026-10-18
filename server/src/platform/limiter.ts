/**
 * Small in-process bounded-concurrency limiter (R1 of the multi-agent-review
 * plan). No external queue library: a FIFO array of pending resolvers plus an
 * `active` counter. One instance is created per multi-agent run (owned by
 * `MultiAgentRunService`), so a run-wide limit of N holds across its whole
 * lifetime, including retries that share the same limiter.
 */
export interface Limiter {
  run<T>(fn: () => Promise<T>): Promise<T>;
  readonly active: number;
  readonly pending: number;
}

export function createLimiter(max: number): Limiter {
  let active = 0;
  const queue: (() => void)[] = [];

  function next(): void {
    if (active >= max) return;
    const resume = queue.shift();
    if (!resume) return;
    active++;
    resume();
  }

  return {
    get active() {
      return active;
    },
    get pending() {
      return queue.length;
    },
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await new Promise<void>((resolve) => {
        queue.push(resolve);
        next();
      });
      try {
        return await fn();
      } finally {
        active--;
        next();
      }
    },
  };
}
