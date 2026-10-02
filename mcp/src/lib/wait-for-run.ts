import type { DevDigestGateway } from '../gateway/ports.js';

export interface WaitResult {
  status: 'done' | 'failed' | 'cancelled' | 'running';
  error: string | null;
}

export interface WaitOptions {
  gateway: DevDigestGateway;
  prId: string;
  runId: string;
  waitMs: number;
  pollMs: number;
  signal?: AbortSignal;
  /** Called on each poll while running; only provided when the request carried a progressToken. */
  onProgress?: (elapsedMs: number) => void | Promise<void>;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

/**
 * Polls the run until it leaves `running`, the budget elapses, or the request is
 * aborted. Never cancels the server-side run (its cost is already incurred).
 */
export async function waitForRun(o: WaitOptions): Promise<WaitResult> {
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? defaultSleep;
  const started = now();
  for (;;) {
    const runs = await o.gateway.listRuns(o.prId);
    const run = runs.find((r) => r.runId === o.runId);
    const status = run?.status ?? 'running';
    if (status === 'done' || status === 'failed' || status === 'cancelled') {
      return { status, error: run?.error ?? null };
    }
    const elapsed = now() - started;
    if (elapsed >= o.waitMs || o.signal?.aborted) return { status: 'running', error: null };
    if (o.onProgress) await o.onProgress(elapsed);
    await sleep(Math.min(o.pollMs, Math.max(0, o.waitMs - elapsed)), o.signal);
    if (o.signal?.aborted) return { status: 'running', error: null };
  }
}
