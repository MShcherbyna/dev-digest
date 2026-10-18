import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { RunnerError } from './errors.js';

/**
 * Loads the checked-in `.devdigest/memory.jsonl` (one JSON object per line).
 * The file is untrusted on-disk content in the target repo: every line is
 * `safeParse`d against a runner-local schema, and any bad line fails the whole
 * run (`RunnerError` -> hard-fail: exit 1, nothing posted, no artifact).
 * A missing, empty or whitespace-only file is not an error (AC-19).
 */
const MemoryLine = z.object({
  kind: z.string().min(1),
  scope: z.enum(['global', 'repo']),
  content: z.string(),
});
export type MemoryItem = z.infer<typeof MemoryLine>;

export function loadMemory(
  devdigestDir: string,
  readFile: typeof readFileSync = readFileSync,
): MemoryItem[] {
  let raw: string;
  try {
    raw = readFile(path.join(devdigestDir, 'memory.jsonl'), 'utf8') as unknown as string;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new RunnerError(`Cannot read memory.jsonl: ${(err as Error).message}`);
  }

  const items: MemoryItem[] = [];
  raw.split(/\r?\n/).forEach((line, idx) => {
    if (line.trim() === '') return;
    const n = idx + 1;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch (err) {
      throw new RunnerError(`memory.jsonl line ${n}: invalid JSON (${(err as Error).message})`);
    }
    const parsed = MemoryLine.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      throw new RunnerError(`memory.jsonl line ${n}: ${issues}`);
    }
    items.push(parsed.data);
  });
  return items;
}
