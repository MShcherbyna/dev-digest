/** AC-10: env VALUES and `.env` never reach the prompt. Real tmp-dir clone through FsRepoFiles. */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsRepoFiles } from '../src/adapters/repo-files/fs.js';
import { gatherFacts } from '../src/modules/onboarding/service.js';
import { buildTourMessages } from '../src/modules/onboarding/prompt.js';

describe('onboarding prompt facts (AC-10)', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'ob-facts-'));
    await mkdir(join(root, 'server'), { recursive: true });
    await writeFile(join(root, '.env'), 'SECRET=abc\n');
    await writeFile(join(root, '.env.example'), 'STRIPE_KEY=sk_test_x\n# NOTE=ignored\n');
    await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { dev: 'next dev --token=hunter2' } }));
    await writeFile(join(root, 'README.md'), '# Demo\nRun it.\n');
    await writeFile(join(root, 'server/package.json'), JSON.stringify({ scripts: { start: 'node x.js' } }));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('keeps env NAMES and script NAMES only, never reads .env, wraps every repo block as untrusted', async () => {
    // Catches: a secret value (from .env or .env.example) or a script body leaking into the LLM prompt,
    // and repo text being injected unwrapped.
    const files = new FsRepoFiles();
    const read = vi.spyOn(files, 'read');
    const facts = await gatherFacts(files, root, {
      fullName: 'acme/demo',
      defaultBranch: 'main',
      index: { status: 'full', filesIndexed: 3 },
      topFiles: ['server/index.ts'],
      chains: [['a.ts', 'b.ts']],
    });
    const messages = await buildTourMessages(facts);
    const text = messages.map((m) => m.content).join('\n');

    expect(text).toContain('STRIPE_KEY');
    expect(text).not.toContain('abc');
    expect(text).not.toContain('sk_test_x');
    expect(text).not.toContain('hunter2');
    expect(facts.packageScripts.map((p) => [p.path, p.scripts])).toEqual([
      ['package.json', ['dev']],
      ['server/package.json', ['start']],
    ]);

    const readPaths = read.mock.calls.map((c) => c[1]);
    expect(readPaths).toContain('.env.example');
    expect(readPaths).not.toContain('.env');

    const user = messages.find((m) => m.role === 'user')!.content as string;
    const blocks = user.split('\n\n').filter((b) => b.trim() !== '');
    // every block of repo-derived data sits inside an untrusted delimiter
    expect(user.match(/<untrusted /g)!.length).toBe(user.match(/<\/untrusted>/g)!.length);
    expect(user.startsWith('<untrusted ')).toBe(true);
    expect(user.trimEnd().endsWith('</untrusted>')).toBe(true);
    expect(blocks.length).toBeGreaterThan(0);
    expect(user).toContain('<untrusted source="readme">');
    expect(user).toContain('<untrusted source="env-example-names">');
  });
});
