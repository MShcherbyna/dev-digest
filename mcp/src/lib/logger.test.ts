import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, redact } from './logger.js';

afterEach(() => vi.restoreAllMocks());

describe('logger', () => {
  it('writes to stderr and never to stdout', () => {
    const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    createLogger('info').info('hello', { a: 1 });
    expect(err).toHaveBeenCalledTimes(1);
    expect(out).not.toHaveBeenCalled();
  });

  it('respects the level', () => {
    const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    createLogger('warn').info('skip');
    expect(err).not.toHaveBeenCalled();
  });

  it('redacts sensitive keys', () => {
    expect(redact({ apiToken: 'x', Authorization: 'y', secretValue: 'z', ok: 1 })).toEqual({
      apiToken: '[redacted]',
      Authorization: '[redacted]',
      secretValue: '[redacted]',
      ok: 1,
    });
  });
});
