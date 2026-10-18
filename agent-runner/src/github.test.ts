import { describe, it, expect } from 'vitest';
import { fetchPrDiff, type FetchLike } from './github.js';
import { parseUnifiedDiff, stripIgnoredFiles } from './diff.js';
import { RunnerError } from './errors.js';

const ctx = { owner: 'acme', repo: 'widgets', prNumber: 41 };
const PR_URL = 'https://api.github.com/repos/acme/widgets/pulls/41';

/** Routes by URL; records every call so tests can assert the fallback was (not) taken. */
function stubFetch(routes: Record<string, () => Response>): { fetchImpl: FetchLike; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const route = routes[url];
    if (!route) throw new Error(`unexpected fetch ${url}`);
    return route();
  }) as FetchLike;
  return { fetchImpl, urls };
}

const tooLarge = () =>
  new Response(JSON.stringify({ message: 'Sorry, the diff exceeded the maximum number of lines (20000)' }), {
    status: 406,
  });
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('fetchPrDiff', () => {
  it('returns the diff media type as-is when GitHub serves it', async () => {
    const { fetchImpl, urls } = stubFetch({ [PR_URL]: () => new Response('diff --git a/x b/x\n', { status: 200 }) });
    expect(await fetchPrDiff(ctx, 't', fetchImpl)).toBe('diff --git a/x b/x\n');
    expect(urls).toEqual([PR_URL]);
  });

  it('a 406 too_large diff is rebuilt from the paginated /files list', async () => {
    // Catches: a PR over 20 000 diff lines hard-failing every agent's CI job.
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      filename: `src/f${i}.ts`,
      status: 'modified',
      patch: `@@ -1,1 +1,1 @@\n-old${i}\n+new${i}`,
    }));
    const page2 = [
      { filename: 'src/added.ts', status: 'added', patch: '@@ -0,0 +1,2 @@\n+a\n+b' },
      { filename: 'src/new-name.ts', previous_filename: 'src/old-name.ts', status: 'renamed', patch: '@@ -3,1 +3,1 @@\n-x\n+y' },
      { filename: 'logo.png', status: 'added' }, // binary: no patch
      { filename: '.devdigest/runner/index.js', status: 'added', patch: '@@ -0,0 +1,1 @@\n+bundle' },
    ];
    const { fetchImpl, urls } = stubFetch({
      [PR_URL]: tooLarge,
      [`${PR_URL}/files?per_page=100&page=1`]: () => json(page1),
      [`${PR_URL}/files?per_page=100&page=2`]: () => json(page2),
    });

    const raw = await fetchPrDiff(ctx, 't', fetchImpl);
    expect(urls).toHaveLength(3); // stops after the short page

    const diff = parseUnifiedDiff(stripIgnoredFiles(raw));
    const paths = diff.files.map((f) => f.path);
    expect(paths).toHaveLength(102);
    expect(paths).toContain('src/f99.ts');
    expect(paths).toContain('src/new-name.ts');
    expect(paths).not.toContain('logo.png');
    expect(paths).not.toContain('.devdigest/runner/index.js');
    const added = diff.files.find((f) => f.path === 'src/added.ts')!;
    expect(added.hunks[0]!.newLineNumbers).toEqual([1, 2]);
  });

  it('any other error still fails clearly', async () => {
    const { fetchImpl } = stubFetch({ [PR_URL]: () => new Response('nope', { status: 500 }) });
    await expect(fetchPrDiff(ctx, 't', fetchImpl)).rejects.toThrow(RunnerError);
  });
});
