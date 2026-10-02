import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeFake } from '../../test/helpers/fake-gateway.js';
import { connect, structured, type Harness } from '../../test/helpers/harness.js';

let h: Harness;
afterEach(() => h.close());

describe('get_blast_radius', () => {
  it('returns the stub without touching the gateway and never isError', async () => {
    const gw = makeFake();
    const spies = [vi.spyOn(gw, 'findRepo'), vi.spyOn(gw, 'findPull'), vi.spyOn(gw, 'listRuns')];
    h = await connect(gw);
    const r = await h.call('get_blast_radius', { repo: 'acme/payments-api', pr: 482 });
    expect(r.isError).toBeFalsy();
    expect(structured<{ status: string; message: string }>(r).status).toBe('not_implemented');
    expect(structured<{ message: string }>(r).message).toContain('not implemented');
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});
