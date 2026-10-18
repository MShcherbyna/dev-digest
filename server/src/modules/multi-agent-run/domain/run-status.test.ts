import { describe, it, expect } from 'vitest';
import { aggregateStatus, latestAttempts, wallClockMs, totalCost, type RunStatusChild } from './run-status.js';

function child(overrides: Partial<RunStatusChild> & { agentId: string; createdOrder: number }): RunStatusChild {
  return {
    status: 'done',
    ranAt: null,
    durationMs: null,
    costUsd: null,
    ...overrides,
  };
}

describe('aggregateStatus', () => {
  it('running while any child is queued or running', () => {
    expect(
      aggregateStatus(
        [child({ agentId: 'a', createdOrder: 0, status: 'done' }), child({ agentId: 'b', createdOrder: 1, status: 'queued' })],
        null,
      ),
    ).toBe('running');
    expect(
      aggregateStatus([child({ agentId: 'a', createdOrder: 0, status: 'running' })], null),
    ).toBe('running');
  });

  it('done when every child is done', () => {
    expect(
      aggregateStatus(
        [child({ agentId: 'a', createdOrder: 0, status: 'done' }), child({ agentId: 'b', createdOrder: 1, status: 'done' })],
        null,
      ),
    ).toBe('done');
  });

  it('partial when at least one done and at least one failed/cancelled (AC-17)', () => {
    expect(
      aggregateStatus(
        [
          child({ agentId: 'a', createdOrder: 0, status: 'done' }),
          child({ agentId: 'b', createdOrder: 1, status: 'failed' }),
        ],
        null,
      ),
    ).toBe('partial');
    expect(
      aggregateStatus(
        [
          child({ agentId: 'a', createdOrder: 0, status: 'done' }),
          child({ agentId: 'b', createdOrder: 1, status: 'cancelled' }),
        ],
        null,
      ),
    ).toBe('partial');
  });

  it('cancelled when no child is done and the run was cancelled', () => {
    expect(
      aggregateStatus(
        [
          child({ agentId: 'a', createdOrder: 0, status: 'cancelled' }),
          child({ agentId: 'b', createdOrder: 1, status: 'cancelled' }),
        ],
        new Date(),
      ),
    ).toBe('cancelled');
    expect(
      aggregateStatus(
        [
          child({ agentId: 'a', createdOrder: 0, status: 'cancelled' }),
          child({ agentId: 'b', createdOrder: 1, status: 'cancelled' }),
        ],
        null,
      ),
    ).toBe('cancelled');
  });

  it('failed when no child is done and it was not cancelled', () => {
    expect(
      aggregateStatus([child({ agentId: 'a', createdOrder: 0, status: 'failed' })], null),
    ).toBe('failed');
  });
});

describe('latestAttempts', () => {
  it('keeps only the newest child per agent (R4)', () => {
    const children = [
      child({ agentId: 'a', createdOrder: 0, status: 'failed' }),
      child({ agentId: 'a', createdOrder: 1, status: 'done' }),
      child({ agentId: 'b', createdOrder: 0, status: 'done' }),
    ];
    const latest = latestAttempts(children);
    expect(latest).toHaveLength(2);
    expect(latest.find((c) => c.agentId === 'a')?.status).toBe('done');
  });
});

describe('wallClockMs', () => {
  it('approximates the slowest child, not the sum (AC-16)', () => {
    const parentRanAt = new Date('2026-01-01T00:00:00.000Z');
    const children = [
      child({ agentId: 'a', createdOrder: 0, ranAt: parentRanAt, durationMs: 2000 }),
      child({ agentId: 'b', createdOrder: 0, ranAt: parentRanAt, durationMs: 3000 }),
      child({ agentId: 'c', createdOrder: 0, ranAt: parentRanAt, durationMs: 5000 }),
    ];
    expect(wallClockMs(parentRanAt, children)).toBe(5000);
  });

  it('while any latest attempt is still running/queued, uses now - parentRanAt', () => {
    const parentRanAt = new Date(Date.now() - 1000);
    const children = [child({ agentId: 'a', createdOrder: 0, status: 'running' })];
    const ms = wallClockMs(parentRanAt, children);
    expect(ms).toBeGreaterThanOrEqual(1000);
  });
});

describe('totalCost', () => {
  it('sums non-null costs over the latest attempts only', () => {
    const children = [
      child({ agentId: 'a', createdOrder: 0, status: 'failed', costUsd: 0.5 }),
      child({ agentId: 'a', createdOrder: 1, status: 'done', costUsd: 0.1 }),
      child({ agentId: 'b', createdOrder: 0, status: 'done', costUsd: null }),
    ];
    expect(totalCost(children)).toBeCloseTo(0.1);
  });
});
