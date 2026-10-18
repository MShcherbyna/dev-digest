import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsRunnerBundle } from './fs.js';

describe('FsRunnerBundle', () => {
  it('reads the bundle file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runner-'));
    await writeFile(join(dir, 'index.js'), 'console.log(1)');
    expect(await new FsRunnerBundle(join(dir, 'index.js')).read()).toBe('console.log(1)');
  });

  it('a missing bundle is 500 runner_bundle_missing', async () => {
    await expect(new FsRunnerBundle('/nonexistent/index.js').read()).rejects.toMatchObject({
      code: 'runner_bundle_missing',
      statusCode: 500,
    });
  });
});
