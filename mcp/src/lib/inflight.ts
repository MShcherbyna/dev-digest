/** Tracks in-flight tool handlers so shutdown can let them settle (bounded) before exiting. */
export class InflightTracker {
  private readonly pending = new Set<Promise<unknown>>();

  track<T>(p: Promise<T>): Promise<T> {
    this.pending.add(p);
    const done = (): void => {
      this.pending.delete(p);
    };
    p.then(done, done);
    return p;
  }

  get size(): number {
    return this.pending.size;
  }

  /** Resolves when nothing is in flight or after `maxMs`, whichever comes first. Returns true if drained. */
  async drain(maxMs: number): Promise<boolean> {
    const deadline = Date.now() + maxMs;
    while (this.pending.size > 0) {
      const left = deadline - Date.now();
      if (left <= 0) return false;
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        Promise.allSettled([...this.pending]),
        new Promise<void>((r) => {
          timer = setTimeout(r, left);
        }),
      ]);
      clearTimeout(timer);
    }
    return true;
  }
}
