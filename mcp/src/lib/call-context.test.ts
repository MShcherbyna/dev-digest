import { describe, expect, it, vi } from 'vitest';
import { toCallContext, type RequestExtraLike } from './call-context.js';

const mk = (token?: string | number) => {
  const sendNotification = vi.fn(async () => {});
  const ctl = new AbortController();
  const extra: RequestExtraLike = { signal: ctl.signal, _meta: token === undefined ? undefined : { progressToken: token }, sendNotification };
  return { extra, sendNotification, ctl };
};

describe('toCallContext', () => {
  it('has no onProgress without a progressToken', () => {
    expect(toCallContext(mk().extra).onProgress).toBeUndefined();
  });

  it('builds a progress notification when a token is present and swallows send errors', async () => {
    const { extra, sendNotification } = mk('tok');
    await toCallContext(extra).onProgress?.(24_000);
    expect(sendNotification).toHaveBeenCalledWith({
      method: 'notifications/progress',
      params: { progressToken: 'tok', progress: 24, message: 'running, 24s elapsed' },
    });
    sendNotification.mockRejectedValueOnce(new Error('closed'));
    await expect(toCallContext(extra).onProgress?.(1000)).resolves.toBeUndefined();
  });

  it('aborts when either the request or the shutdown signal aborts', () => {
    const a = mk();
    const shutdown = new AbortController();
    const ctx = toCallContext(a.extra, shutdown.signal);
    expect(ctx.signal.aborted).toBe(false);
    shutdown.abort();
    expect(ctx.signal.aborted).toBe(true);
    const b = mk();
    const ctx2 = toCallContext(b.extra, new AbortController().signal);
    b.ctl.abort();
    expect(ctx2.signal.aborted).toBe(true);
  });
});
