import { afterEach, describe, expect, it } from 'vitest';
import { makeFake } from '../../test/helpers/fake-gateway.js';
import { connect, structured, textOf, type Harness } from '../../test/helpers/harness.js';

let h: Harness;
afterEach(() => h.close());

describe('devdigest_list_agents', () => {
  it('lists agents with slug and no system prompt', async () => {
    h = await connect();
    const r = await h.call('devdigest_list_agents', {});
    const s = structured<{ count: number; agents: { slug: string }[] }>(r);
    expect(s.count).toBe(2);
    expect(s.agents[0]?.slug).toBe('security-reviewer');
    expect(textOf(r)).not.toContain('system_prompt');
  });

  it('filters enabled_only', async () => {
    h = await connect();
    expect(structured<{ count: number }>(await h.call('devdigest_list_agents', { enabled_only: true })).count).toBe(1);
  });

  it('empty list is not an error', async () => {
    h = await connect(makeFake({ agents: [] }));
    const r = await h.call('devdigest_list_agents', {});
    expect(r.isError).toBeFalsy();
    expect(structured(r)).toEqual({ count: 0, agents: [] });
  });
});
