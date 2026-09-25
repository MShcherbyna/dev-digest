import { describe, it, expect } from 'vitest';
import { rateLimit } from './rate-limit.js';

describe('rateLimit', () => {
  it('returns 429 when over the limit', () => {
    expect(rateLimit(11, 10).status).toBe(429);
  });
});
