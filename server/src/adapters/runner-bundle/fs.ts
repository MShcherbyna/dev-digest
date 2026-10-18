import { readFile } from 'node:fs/promises';
import { AppError } from '../../platform/errors.js';
import type { RunnerBundle } from '../../modules/ci/ports.js';

/** Reads the built agent-runner bundle (`index.js`) from disk. Only `index.js` is embedded. */
export class FsRunnerBundle implements RunnerBundle {
  constructor(private path: string) {}

  async read(): Promise<string> {
    try {
      return await readFile(this.path, 'utf8');
    } catch {
      throw new AppError(
        'runner_bundle_missing',
        'Build agent-runner first (pnpm build in agent-runner)',
        500,
      );
    }
  }
}
