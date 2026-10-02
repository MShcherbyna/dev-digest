import { BusinessError } from './result.js';

export interface RunGuardOptions {
  maxRuns: number;
  windowMs: number;
  now?: () => number;
}

/** Sliding-window cap on run starts + a per-key in-flight lock so concurrent calls cannot double-start. */
export class RunGuard {
  private readonly starts: number[] = [];
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly now: () => number;

  constructor(private readonly opts: RunGuardOptions) {
    this.now = opts.now ?? Date.now;
  }

  private prune(): void {
    const cutoff = this.now() - this.opts.windowMs;
    while (this.starts.length > 0 && (this.starts[0] ?? 0) <= cutoff) this.starts.shift();
  }

  /** Throws BusinessError when the window is full. Does not record a start. */
  assertCanStart(): void {
    this.prune();
    if (this.starts.length >= this.opts.maxRuns) {
      const mins = Math.round(this.opts.windowMs / 60_000);
      throw new BusinessError({
        what: `Run limit reached (${this.opts.maxRuns} runs per ${mins} min in this session) to cap LLM cost`,
        expected: 'fewer review starts',
        example: 'devdigest_get_findings with repo, pr to read an existing run',
        next: 'use devdigest_get_findings on existing runs, or wait for the window to pass',
      });
    }
  }

  recordStart(): void {
    this.starts.push(this.now());
  }

  /** Serializes `fn` per key; later callers wait for earlier ones. */
  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => undefined);
    this.locks.set(key, tail);
    try {
      return await run;
    } finally {
      if (this.locks.get(key) === tail) this.locks.delete(key);
    }
  }
}
