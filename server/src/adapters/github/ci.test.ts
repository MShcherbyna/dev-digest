import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { TimeoutError } from '../../platform/resilience.js';
import { CiGitHubError } from '../../modules/ci/ports.js';
import { OctokitCiGitHub, classify } from './ci.js';

const http = (status: number, message = '', headers: Record<string, string> = {}) =>
  Object.assign(new Error(message), { status, response: { headers } });

describe('classify (AC-16 / AC-24)', () => {
  it.each([
    ['401', http(401), 'git', true, 'auth', undefined],
    ['429', http(429), 'git', true, 'rate_limited', undefined],
    ['403 with exhausted quota', http(403, '', { 'x-ratelimit-remaining': '0' }), 'actions', false, 'rate_limited', undefined],
    ['403 secondary rate limit text', http(403, 'You have exceeded a secondary rate limit'), 'git', true, 'rate_limited', undefined],
    ['write 403 on git data', http(403, 'Resource not accessible'), 'git', true, 'permission', 'contents'],
    ['write 404 on git data (fine-grained PAT)', http(404, 'Not Found'), 'git', true, 'permission', 'contents'],
    ['write 403 on pulls', http(403), 'pulls', true, 'permission', 'pull_requests'],
    ['write mentioning workflow', http(404, 'refusing to update workflow files without `workflow` scope'), 'git', true, 'permission', 'workflows'],
    ['read 403 on actions', http(403), 'actions', false, 'permission', 'actions'],
    ['read 404 is not a permission error', http(404), 'git', false, 'unexpected', undefined],
    ['500', http(500), 'pulls', true, 'unexpected', undefined],
    ['no status = network', new Error('ECONNRESET'), 'git', false, 'network', undefined],
    ['timeout = network', new TimeoutError(1), 'git', false, 'network', undefined],
  ] as const)('%s', (_n, err, area, write, kind, permission) => {
    const out = classify(err, area, write);
    expect(out).toBeInstanceOf(CiGitHubError);
    expect(out.kind).toBe(kind);
    expect(out.permission).toBe(permission);
  });

  it('keeps an already classified error', () => {
    const e = new CiGitHubError('auth', 'x');
    expect(classify(e, 'git', true)).toBe(e);
  });
});

describe('downloadArtifactJson (zip handling)', () => {
  const adapterWith = (download: () => Promise<unknown>) => {
    const a = new OctokitCiGitHub('token');
    (a as unknown as { octokit: unknown }).octokit = { rest: { actions: { downloadArtifact: download } } };
    return a;
  };
  const zip = (entries: Record<string, string>) =>
    zipSync(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, strToU8(v)])));
  const asBuffer = (u8: Uint8Array) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

  it('returns the text of the single .json entry', async () => {
    const a = adapterWith(async () => ({ data: asBuffer(zip({ 'devdigest-result-x.json': '{"a":1}' })) }));
    expect(await a.downloadArtifactJson('o/r', 1, 1024)).toEqual({ kind: 'ok', text: '{"a":1}' });
  });

  it('a declared-too-large entry is too_large and is never inflated (zip bomb)', async () => {
    const a = adapterWith(async () => ({ data: asBuffer(zip({ 'r.json': 'x'.repeat(50_000) })) }));
    expect(await a.downloadArtifactJson('o/r', 1, 1024)).toEqual({ kind: 'too_large' });
  });

  it('a compressed body above the cap is too_large', async () => {
    const a = adapterWith(async () => ({ data: new ArrayBuffer(2048) }));
    expect(await a.downloadArtifactJson('o/r', 1, 1024)).toEqual({ kind: 'too_large' });
  });

  it('several entries, no .json entry, or a corrupt zip yield empty text (fails validation downstream)', async () => {
    for (const data of [
      asBuffer(zip({ 'a.json': '{}', 'b.json': '{}' })),
      asBuffer(zip({ 'readme.txt': 'hi' })),
      new Uint8Array([1, 2, 3, 4]).buffer,
    ]) {
      const a = adapterWith(async () => ({ data }));
      expect(await a.downloadArtifactJson('o/r', 1, 1024)).toEqual({ kind: 'ok', text: '' });
    }
  });

  it.each([410, 404])('HTTP %i is expired', async (status) => {
    const a = adapterWith(async () => {
      throw http(status);
    });
    expect(await a.downloadArtifactJson('o/r', 1, 1024)).toEqual({ kind: 'expired' });
  });

  it('other failures are classified, not leaked', async () => {
    const a = adapterWith(async () => {
      throw http(401);
    });
    await expect(a.downloadArtifactJson('o/r', 1, 1024)).rejects.toMatchObject({ kind: 'auth' });
  });
});
