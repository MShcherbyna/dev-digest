/** Plain per-call seam handed to tool code, so tools never build JSON-RPC notifications. */
export interface CallContext {
  /** Aborted when the client cancels the request OR the server is shutting down. */
  signal: AbortSignal;
  /** Present only when the client asked for progress (sent a progressToken). */
  onProgress?: (elapsedMs: number) => Promise<void>;
}

/** The slice of the SDK's request-handler extra that we use (structurally compatible). */
export interface RequestExtraLike {
  signal: AbortSignal;
  _meta?: { progressToken?: string | number } | undefined;
  sendNotification: (n: {
    method: 'notifications/progress';
    params: { progressToken: string | number; progress: number; message?: string };
  }) => Promise<void>;
}

export function toCallContext(extra: RequestExtraLike, shutdown?: AbortSignal): CallContext {
  const signal = shutdown ? AbortSignal.any([extra.signal, shutdown]) : extra.signal;
  const token = extra._meta?.progressToken;
  if (token === undefined) return { signal };
  return {
    signal,
    onProgress: async (elapsedMs) => {
      const secs = Math.round(elapsedMs / 1000);
      try {
        await extra.sendNotification({
          method: 'notifications/progress',
          params: { progressToken: token, progress: secs, message: `running, ${secs}s elapsed` },
        });
      } catch {
        // Progress is feedback only; never fail the call because of it.
      }
    },
  };
}
