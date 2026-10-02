import { afterEach, describe, expect, it } from 'vitest';
import { makeFake } from '../../test/helpers/fake-gateway.js';
import { connect, structured, textOf, type Harness } from '../../test/helpers/harness.js';
import type { ConventionRecord } from '../gateway/ports.js';

let h: Harness;
afterEach(() => h.close());

const conv = (i: number, accepted: boolean): ConventionRecord => ({
  id: `c${i}`, rule: `Rule ${i}`, evidencePath: `src/a${i}.ts`, evidenceSnippet: `code ${i}`, evidenceLine: i, confidence: 0.9, accepted,
});

type Res = { total: number; accepted_count: number; note: string | null; next_cursor: string | null; conventions: { snippet?: string }[] };

describe('devdigest_get_conventions', () => {
  it('empty list is not an error and carries a note', async () => {
    h = await connect();
    const r = await h.call('devdigest_get_conventions', { repo: 'acme/payments-api' });
    expect(r.isError).toBeFalsy();
    expect(structured<Res>(r).note).toContain('not available via MCP');
  });

  it('snippets are opt-in; accepted_only filters; pagination works', async () => {
    h = await connect(makeFake({ conventions: [conv(1, true), conv(2, false), conv(3, true)] }));
    const plain = structured<Res>(await h.call('devdigest_get_conventions', { repo: 'acme/payments-api' }));
    expect(plain.conventions[0]?.snippet).toBeUndefined();
    const withSnip = structured<Res>(await h.call('devdigest_get_conventions', { repo: 'acme/payments-api', include_snippets: true }));
    expect(withSnip.conventions[0]?.snippet).toBe('code 1');
    const acc = structured<Res>(await h.call('devdigest_get_conventions', { repo: 'acme/payments-api', accepted_only: true }));
    expect(acc.total).toBe(2);
    expect(acc.accepted_count).toBe(2);
    const p1 = structured<Res>(await h.call('devdigest_get_conventions', { repo: 'acme/payments-api', limit: 2 }));
    expect(p1.next_cursor).not.toBeNull();
    const p2 = structured<Res>(await h.call('devdigest_get_conventions', { repo: 'acme/payments-api', limit: 2, cursor: p1.next_cursor as string }));
    expect(p2.conventions).toHaveLength(1);
    expect(p2.next_cursor).toBeNull();
  });

  it('unknown repo is a recovery error', async () => {
    h = await connect();
    const r = await h.call('devdigest_get_conventions', { repo: 'x/y' });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain('Next:');
  });
});
