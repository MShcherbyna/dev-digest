import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import type { CiPostAs, CiTrigger } from '@devdigest/shared';
import { mergeWorkflow, normalizeTriggers, removeAgentJob, validateWorkflow } from './workflow.js';

type Wf = {
  name: string;
  on: { pull_request: { types: string[] } };
  jobs: Record<string, any>;
};
const gen = (
  slug = 'sec',
  triggers: CiTrigger[] = ['opened', 'synchronize'],
  postAs: CiPostAs = 'github_review',
) => mergeWorkflow(null, slug, triggers, postAs);

describe('generated workflow (AC-8)', () => {
  const wf = parse(gen()) as Wf;
  const job = wf.jobs.sec;

  it('has the name, the chosen trigger types and one job per slug', () => {
    expect(wf.name).toBe('DevDigest Review');
    expect(wf.on.pull_request.types).toEqual(['opened', 'synchronize']);
    expect(Object.keys(wf.jobs)).toEqual(['sec']);
  });

  it('skips fork PRs and limits permissions', () => {
    expect(job.if).toBe('github.event.pull_request.head.repo.full_name == github.repository');
    expect(job.permissions).toEqual({ contents: 'read', 'pull-requests': 'write' });
  });

  it('checks out the PR base (a branch cut before the CI merge has no .devdigest/), uses Node 22 and runs the bundled runner', () => {
    expect(job.steps[0].uses).toBe('actions/checkout@v4');
    expect(job.steps[0].with.ref).toBe('${{ github.event.pull_request.base.sha }}');
    expect(job.steps[1].with['node-version']).toBe(22);
    expect(job.steps[2].run).toBe('node .devdigest/runner/index.js');
  });

  it('passes the env contract (secrets by reference, never values)', () => {
    expect(job.steps[2].env).toEqual({
      OPENROUTER_API_KEY: '${{ secrets.OPENROUTER_API_KEY }}',
      GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
      PR_NUMBER: '${{ github.event.pull_request.number }}',
      DEVDIGEST_POST_AS: 'github_review',
      DEVDIGEST_AGENT: 'sec',
    });
  });

  it('uploads the slug-named artifact even when the runner fails', () => {
    const upload = job.steps[3];
    expect(upload.if).toBe('always()');
    expect(upload.with).toEqual({
      name: 'devdigest-result-sec',
      path: 'devdigest-result-sec.json',
      'if-no-files-found': 'ignore',
    });
  });

  it('never references the retired review action', () => {
    expect(gen()).not.toContain('devdigest/review-action');
  });

  it.each(['github_review', 'pr_comment', 'none'] as const)('writes DEVDIGEST_POST_AS=%s', (postAs) => {
    const parsed = parse(gen('sec', ['opened', 'synchronize'], postAs)) as Wf;
    expect(parsed.jobs.sec.steps[2].env.DEVDIGEST_POST_AS).toBe(postAs);
  });
});

describe('mergeWorkflow / removeAgentJob (AC-15, AC-34)', () => {
  const jobText = (text: string, slug: string) => {
    const doc = parse(text) as Wf;
    return JSON.stringify(doc.jobs[slug]);
  };

  it('adds job B next to A and leaves A untouched, byte for byte', () => {
    const a = gen('alpha');
    const merged = mergeWorkflow(a, 'beta', ['opened', 'synchronize'], 'none');
    expect(Object.keys((parse(merged) as Wf).jobs)).toEqual(['alpha', 'beta']);
    expect(jobText(merged, 'alpha')).toBe(jobText(a, 'alpha'));
    // A's block of text is a verbatim prefix of the merged file's jobs section.
    const aBlock = a.slice(a.indexOf('  alpha:'));
    expect(merged).toContain(aBlock.trimEnd());
  });

  it('replaces only its own job on a re-export and applies new triggers', () => {
    const a = gen('alpha');
    const again = mergeWorkflow(a, 'alpha', ['reopened', 'opened'], 'pr_comment');
    const parsed = parse(again) as Wf;
    expect(parsed.on.pull_request.types).toEqual(['opened', 'reopened']);
    expect(parsed.jobs.alpha.steps[2].env.DEVDIGEST_POST_AS).toBe('pr_comment');
  });

  it('keeps unrelated top-level keys of a hand-written file', () => {
    const existing = 'name: Mine\non:\n  pull_request:\n    types: [opened]\n  push:\n    branches: [main]\nenv:\n  FOO: bar\njobs:\n  lint:\n    runs-on: ubuntu-latest\n    steps: []\n';
    const parsed = parse(mergeWorkflow(existing, 'sec', ['synchronize'], 'none')) as Record<string, any>;
    expect(parsed.name).toBe('Mine');
    expect(parsed.env).toEqual({ FOO: 'bar' });
    expect(parsed.on.push).toEqual({ branches: ['main'] });
    expect(Object.keys(parsed.jobs)).toEqual(['lint', 'sec']);
  });

  it('removeAgentJob drops one job and returns null when none remain', () => {
    const two = mergeWorkflow(gen('alpha'), 'beta', ['opened'], 'none');
    const left = removeAgentJob(two, 'alpha')!;
    expect(Object.keys((parse(left) as Wf).jobs)).toEqual(['beta']);
    expect(removeAgentJob(left, 'beta')).toBeNull();
  });

  it('removeAgentJob returns an unparsable file unchanged', () => {
    expect(removeAgentJob('a: [unclosed', 'x')).toBe('a: [unclosed');
  });

  it('rejects an unparsable existing file as workflow_invalid', () => {
    expect(() => mergeWorkflow('jobs: [', 'x', ['opened'], 'none')).toThrowError(/./);
  });
});

describe('validateWorkflow (AC-9)', () => {
  it('accepts a generated workflow', () => {
    expect(() => validateWorkflow(gen())).not.toThrow();
  });

  it('rejects broken YAML with workflow_invalid and a line number', () => {
    expect.assertions(3);
    try {
      validateWorkflow('name: x\njobs:\n  a: [unclosed\n');
    } catch (err) {
      const e = err as { code: string; statusCode: number; details: { line?: number } };
      expect(e.code).toBe('workflow_invalid');
      expect(e.statusCode).toBe(422);
      expect(typeof e.details.line).toBe('number');
    }
  });

  it('rejects a non-mapping document', () => {
    expect(() => validateWorkflow('- just\n- a list\n')).toThrowError();
  });
});

describe('normalizeTriggers', () => {
  it('orders canonically and de-duplicates', () => {
    expect(normalizeTriggers(['reopened', 'opened', 'opened'])).toEqual(['opened', 'reopened']);
  });
});
