import { Document, isMap, parseDocument, type YAMLMap } from 'yaml';
import type { CiPostAs, CiTrigger } from '@devdigest/shared';
import { AppError } from '../../../platform/errors.js';
import { RUNNER_PATH, resultArtifactName } from '../constants.js';

const TRIGGER_ORDER: CiTrigger[] = ['opened', 'synchronize', 'reopened'];

/** Canonical, de-duplicated trigger order so regenerated files are stable. */
export function normalizeTriggers(triggers: CiTrigger[]): CiTrigger[] {
  return TRIGGER_ORDER.filter((t) => triggers.includes(t));
}

/** One agent's job (AC-8). The job id is the agent slug; forks are skipped; permissions are minimal. */
export function renderAgentJob(slug: string, postAs: CiPostAs): Record<string, unknown> {
  return {
    if: 'github.event.pull_request.head.repo.full_name == github.repository',
    'runs-on': 'ubuntu-latest',
    permissions: { contents: 'read', 'pull-requests': 'write' },
    steps: [
      { uses: 'actions/checkout@v4', with: { ref: '${{ github.event.pull_request.head.sha }}' } },
      { uses: 'actions/setup-node@v4', with: { 'node-version': 22 } },
      {
        name: 'Run DevDigest review',
        run: `node ${RUNNER_PATH}`,
        env: {
          OPENROUTER_API_KEY: '${{ secrets.OPENROUTER_API_KEY }}',
          GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
          PR_NUMBER: '${{ github.event.pull_request.number }}',
          DEVDIGEST_POST_AS: postAs,
          DEVDIGEST_AGENT: slug,
        },
      },
      {
        uses: 'actions/upload-artifact@v4',
        if: 'always()',
        with: {
          name: resultArtifactName(slug),
          path: `${resultArtifactName(slug)}.json`,
          'if-no-files-found': 'ignore',
        },
      },
    ],
  };
}

function invalid(message: string, line?: number): AppError {
  return new AppError('workflow_invalid', message, 422, line === undefined ? {} : { line });
}

/**
 * Add or replace only `jobs.<slug>` and `on.pull_request.types`. Without an
 * existing file a new "DevDigest Review" workflow is built. Untouched nodes keep
 * their text (the yaml Document API preserves them for generated files).
 */
export function mergeWorkflow(
  existing: string | null,
  slug: string,
  triggers: CiTrigger[],
  postAs: CiPostAs,
): string {
  const types = normalizeTriggers(triggers);
  const job = renderAgentJob(slug, postAs);
  if (existing === null) {
    const doc = new Document({
      name: 'DevDigest Review',
      on: { pull_request: { types } },
      jobs: { [slug]: job },
    });
    return doc.toString({ lineWidth: 0 });
  }
  const doc = parseDocument(existing);
  if (doc.errors.length > 0 || !isMap(doc.contents)) {
    throw invalid(doc.errors[0]?.message ?? 'The existing workflow is not a YAML mapping', doc.errors[0]?.linePos?.[0].line);
  }
  const root = doc.contents as YAMLMap;
  const on = root.get('on', true);
  if (on !== undefined && !isMap(on)) throw invalid('The existing workflow has an unsupported "on" section');
  try {
    doc.setIn(['on', 'pull_request', 'types'], doc.createNode(types));
    doc.setIn(['jobs', slug], doc.createNode(job));
  } catch {
    throw invalid('The existing workflow has an unsupported "on" or "jobs" section');
  }
  return doc.toString({ lineWidth: 0 });
}

/**
 * Drop one agent's job. Returns the new text, or null when no jobs remain.
 * An unparsable file is returned unchanged: removal must never rewrite a file it cannot read.
 */
export function removeAgentJob(text: string, slug: string): string | null {
  const doc = parseDocument(text);
  if (doc.errors.length > 0 || !isMap(doc.contents)) return text;
  doc.deleteIn(['jobs', slug]);
  const jobs = doc.getIn(['jobs']);
  if (!isMap(jobs) || jobs.items.length === 0) return null;
  return doc.toString({ lineWidth: 0 });
}

/** AC-9: an unparsable workflow is `422 workflow_invalid` with the first error's line. */
export function validateWorkflow(text: string): void {
  const doc = parseDocument(text);
  const first = doc.errors[0];
  if (first) throw invalid(first.message, first.linePos?.[0].line);
  if (!isMap(doc.contents)) throw invalid('The workflow must be a YAML mapping');
}
