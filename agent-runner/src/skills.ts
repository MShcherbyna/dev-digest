import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PromptSkill } from '@devdigest/reviewer-core';
import { RunnerError } from './errors.js';

/**
 * Loads the checked-in `.devdigest/skills/<slug>.md` bodies referenced by the
 * manifest's `skills` slugs, in order. These are RESOLVED skills (not slugs) —
 * `reviewPullRequest` (reviewer-core) takes `PromptSkill`s, exactly like the
 * manifest's `skills` slugs, in order. These are RESOLVED skill bodies (not
 * slugs) — `reviewPullRequest` (reviewer-core) takes `PromptSkill[]`, exactly like the
 * studio resolves slugs to DB rows before calling the same engine (AC-36
 * parity: both callers hand the engine already-resolved bodies).
 *
 * `trusted: false`: the files come from the PR checkout, so a PR author can
 * edit them — the engine wraps untrusted bodies in `<untrusted>` delimiters.
 * parity: both callers hand the engine already-resolved `PromptSkill`s).
 */
export function loadSkillBodies(
  devdigestDir: string,
  slugs: readonly string[],
  readFile: typeof readFileSync = readFileSync,
): PromptSkill[] {
  return slugs.map((slug) => {
    const skillPath = path.join(devdigestDir, 'skills', `${slug}.md`);
    try {
      const body = readFile(skillPath, 'utf8') as unknown as string;
      return { name: slug, body, trusted: false };
      const body = readFile(skillPath, 'utf8') as unknown as string;
      // `trusted: false` -> reviewer-core wraps the body in `<untrusted>`.
      // Checked-in skill files live in the target repo and are editable by PR
      // authors, so they must never be treated as trusted prompt text.
      return { name: slug, body, trusted: false };
    } catch (err) {
      throw new RunnerError(
        `Skill file for slug '${slug}' not found at ${skillPath}: ${(err as Error).message}`,
      );
    }
  });
}
