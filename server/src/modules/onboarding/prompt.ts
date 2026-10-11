import type { ChatMessage } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import { loadPromptTemplate } from '../../platform/prompts.js';
import { formatChains } from './facts.js';
import type { RepoFacts } from './ports.js';

const NONE = '(none)';

function lines(items: string[]): string {
  return items.length > 0 ? items.join('\n') : NONE;
}

/**
 * Onboarding messages. Every repo-derived block is delimiter-wrapped as
 * untrusted data. Env VALUES are never part of `facts`, only names.
 */
export async function buildTourMessages(facts: RepoFacts): Promise<ChatMessage[]> {
  const blocks = [
    wrapUntrusted('repo', `${facts.fullName} (default branch: ${facts.defaultBranch})`),
    wrapUntrusted('index', `status: ${facts.index.status}; files indexed: ${facts.index.filesIndexed}`),
    wrapUntrusted('top-files', lines(facts.topFiles)),
    wrapUntrusted('dependency-chains', facts.chains.length > 0 ? formatChains(facts.chains) : NONE),
    wrapUntrusted('tree', lines(facts.tree)),
    wrapUntrusted(
      'package-scripts',
      lines(facts.packageScripts.map((p) => `${p.path}: ${p.scripts.join(', ') || NONE}`)),
    ),
    wrapUntrusted(
      'compose-services',
      lines(facts.composeServices.map((c) => `${c.path}: ${c.services.join(', ') || NONE}`)),
    ),
    wrapUntrusted('env-example-names', lines(facts.envNames)),
    wrapUntrusted('readme', facts.readme.trim() === '' ? NONE : facts.readme),
  ];
  return [
    { role: 'system', content: await loadPromptTemplate('onboarding.system.md') },
    { role: 'user', content: blocks.join('\n\n') },
  ];
}
