import { describe, expect, it, vi } from 'vitest';
import { GatewayNotFoundError, GatewayResponseError, GatewayUnavailableError } from '../gateway/errors.js';
import { nullLogger } from './logger.js';
import { BusinessError } from './result.js';
import { safeHandler } from './safe-handler.js';
import type { RequestExtraLike } from './call-context.js';

const extra: RequestExtraLike = { signal: new AbortController().signal, sendNotification: async () => {} };

async function run(err: unknown): Promise<string> {
  const h = safeHandler(async () => {
    throw err;
  }, nullLogger);
  const r = await h(undefined, extra);
  expect(r.isError).toBe(true);
  const first = r.content[0];
  return first && first.type === 'text' ? first.text : '';
}

describe('safeHandler', () => {
  it('passes results through', async () => {
    const r = await safeHandler(async () => ({ content: [] }), nullLogger)(undefined, extra);
    expect(r.isError).toBeUndefined();
  });

  it('maps api_down with the start command', async () => {
    const t = await run(new GatewayUnavailableError('api_down', 'http://localhost:3001'));
    expect(t).toContain('http://localhost:3001');
    expect(t).toContain('./scripts/dev.sh');
  });

  it('maps db_down with the docker hint', async () => {
    expect(await run(new GatewayUnavailableError('db_down', 'x'))).toContain('docker compose up -d');
  });

  it('maps timeout with the configured ms', async () => {
    expect(await run(new GatewayUnavailableError('timeout', 'x', 1234))).toContain('1234 ms');
  });

  it('maps not-found and response errors', async () => {
    expect(await run(new GatewayNotFoundError('runs'))).toContain('runs');
    const t = await run(new GatewayResponseError(422, 'validation_error', 'bad'));
    expect(t).toContain('validation_error');
    expect(t).toContain('Next:');
  });

  it('maps BusinessError', async () => {
    expect(await run(new BusinessError({ what: 'W', expected: 'E', example: 'X', next: 'N' }))).toContain('Example: X');
  });

  it('handles unknown and non-Error throws without leaking details', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const h = safeHandler(async () => {
      throw 'secret-string-detail';
    }, logger);
    const r = await h(undefined, extra);
    const first = r.content[0];
    expect(first && first.type === 'text' ? first.text : '').not.toContain('secret-string-detail');
    expect(logger.error).toHaveBeenCalled();
  });
});
