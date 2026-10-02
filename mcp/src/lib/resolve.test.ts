import { describe, expect, it, vi } from 'vitest';
import { agent, makeFake } from '../../test/helpers/fake-gateway.js';
import { GatewayNotFoundError } from '../gateway/errors.js';
import { BusinessError } from './result.js';
import { Resolver, matchAgent, slugify } from './resolve.js';

describe('Resolver', () => {
  it('resolves repo case-insensitively and PR with cache + eviction', async () => {
    const gw = makeFake();
    const spy = vi.spyOn(gw, 'findPull');
    const r = new Resolver(gw);
    const a = await r.resolvePr('ACME/Payments-API', 482);
    expect(a.prId).toBe('pr1');
    await r.resolvePr('acme/payments-api', 482);
    expect(spy).toHaveBeenCalledTimes(1);
    r.evictPr('acme/payments-api', 482);
    await r.resolvePr('acme/payments-api', 482);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('guardPr evicts the cached PR on not-found only', async () => {
    const gw = makeFake();
    const spy = vi.spyOn(gw, 'findPull');
    const r = new Resolver(gw);
    await r.resolvePr('acme/payments-api', 482);
    await expect(r.guardPr('acme/payments-api', 482, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await r.resolvePr('acme/payments-api', 482);
    expect(spy).toHaveBeenCalledTimes(1);
    await expect(r.guardPr('acme/payments-api', 482, async () => { throw new GatewayNotFoundError('runs'); })).rejects.toBeInstanceOf(GatewayNotFoundError);
    await r.resolvePr('acme/payments-api', 482);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('gives actionable errors for unknown repo and PR', async () => {
    const r = new Resolver(makeFake());
    await expect(r.resolveRepo('x/y')).rejects.toBeInstanceOf(BusinessError);
    await expect(r.resolvePr('acme/payments-api', 1)).rejects.toMatchObject({ parts: { what: expect.stringContaining('#1') } });
  });
});

describe('matchAgent', () => {
  const agents = [agent('id-1', 'Security Reviewer'), agent('id-2', 'Style Bot')];

  it('matches id, name (case-insensitive) and slug', () => {
    expect(matchAgent(agents, 'id-2').name).toBe('Style Bot');
    expect(matchAgent(agents, 'security reviewer').id).toBe('id-1');
    expect(matchAgent(agents, 'security-reviewer').id).toBe('id-1');
  });

  it('reports ambiguity with candidate names', () => {
    const dup = [agent('1', 'Sec Bot'), agent('2', 'sec-bot')];
    expect(() => matchAgent(dup, 'sec_bot')).toThrow(BusinessError);
    try { matchAgent(dup, 'sec_bot'); } catch (e) { expect((e as BusinessError).parts.what).toContain('Sec Bot'); }
  });

  it('points to devdigest_list_agents on a miss', () => {
    try { matchAgent(agents, 'secuirty'); expect.unreachable(); } catch (e) {
      expect((e as BusinessError).parts.next).toContain('devdigest_list_agents');
      expect((e as BusinessError).parts.example).toContain('security-reviewer');
    }
  });

  it('slugifies', () => {
    expect(slugify('  My Agent_v2!! ')).toBe('my-agent-v2');
  });
});
