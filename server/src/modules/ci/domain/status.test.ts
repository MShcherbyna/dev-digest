import { describe, it, expect } from 'vitest';
import { deriveStatus } from './status.js';

const RAN = new Date('2026-10-01T00:00:00Z');

describe('deriveStatus (AC-25)', () => {
  it.each([
    ['no run yet', { removalPrUrl: null, agentVersion: 1, manifestVersion: 1, lastRunAt: null }, 'pending'],
    ['a run was ingested', { removalPrUrl: null, agentVersion: 1, manifestVersion: 1, lastRunAt: RAN }, 'active'],
    ['agent version is ahead', { removalPrUrl: null, agentVersion: 3, manifestVersion: 2, lastRunAt: RAN }, 'outdated'],
    ['outdated beats pending', { removalPrUrl: null, agentVersion: 2, manifestVersion: 1, lastRunAt: null }, 'outdated'],
    ['removal PR beats outdated', { removalPrUrl: 'https://github.com/a/b/pull/1', agentVersion: 5, manifestVersion: 1, lastRunAt: RAN }, 'removing'],
    ['removal PR beats active', { removalPrUrl: 'https://github.com/a/b/pull/1', agentVersion: 1, manifestVersion: 1, lastRunAt: RAN }, 'removing'],
  ] as const)('%s', (_name, input, expected) => {
    expect(deriveStatus(input)).toBe(expected);
  });
});
