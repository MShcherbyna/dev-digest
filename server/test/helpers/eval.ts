import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { LLMProvider, ModelInfo, CompletionRequest, CompletionResult, StructuredRequest, StructuredResult } from '@devdigest/shared';
import * as t from '../../src/db/schema.js';
import type { Db } from '../../src/db/client.js';

/** One-hunk patch: new-side lines 10..13, line 11 is the added line. */
export const CONFIG_PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';
export const CONFIG_DIFF = `diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n${CONFIG_PATCH}`;

export const GHOST = '00000000-0000-0000-0000-000000000000';

let seq = 0;

/** A repo + PR with a stored patch for `src/config.ts` in the given workspace. */
export async function seedPr(
  db: Db,
  workspaceId: string,
  opts: { patch?: string | null; title?: string; body?: string | null } = {},
) {
  const n = seq++;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name: `eval-${n}`, fullName: `acme/eval-${n}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 500 + n,
      title: opts.title ?? 'Add rate limiting',
      author: 'dev',
      branch: 'feat/x',
      base: 'main',
      headSha: 'sha-1',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: opts.body === undefined ? 'Throttles the API.' : opts.body,
    })
    .returning();
  if (opts.patch !== null) {
    await db
      .insert(t.prFiles)
      .values({ prId: pr!.id, path: 'src/config.ts', additions: 1, deletions: 0, patch: opts.patch ?? CONFIG_PATCH });
  }
  return { repoId: repo!.id, prId: pr!.id };
}

/** A review by `agentId` on `prId` holding one finding with the given decision. */
export async function seedFinding(
  db: Db,
  workspaceId: string,
  prId: string,
  agentId: string | null,
  opts: {
    decision?: 'accepted' | 'dismissed' | 'none';
    startLine?: number;
    endLine?: number;
    title?: string;
    kind?: string;
  } = {},
) {
  const [review] = await db
    .insert(t.reviews)
    .values({ workspaceId, prId, agentId, kind: 'review', verdict: 'comment', summary: 's', score: 80 })
    .returning();
  const decision = opts.decision ?? 'accepted';
  const [f] = await db
    .insert(t.findings)
    .values({
      reviewId: review!.id,
      file: 'src/config.ts',
      startLine: opts.startLine ?? 11,
      endLine: opts.endLine ?? opts.startLine ?? 11,
      severity: 'CRITICAL',
      category: 'security',
      title: opts.title ?? 'Hardcoded Stripe secret key',
      rationale: 'r',
      confidence: 0.9,
      kind: opts.kind ?? 'finding',
      acceptedAt: decision === 'accepted' ? new Date() : null,
      dismissedAt: decision === 'dismissed' ? new Date() : null,
    })
    .returning();
  return { reviewId: review!.id, findingId: f!.id };
}

/** Model answer for the review engine: findings on `src/config.ts` lines (valid only on 10..13). */
export function reviewAnswer(lines: number[]) {
  return {
    verdict: 'comment',
    summary: 'stub',
    score: 50,
    findings: lines.map((n) => ({
      id: `f-${n}`,
      severity: 'WARNING',
      category: 'bug',
      title: `Finding on ${n}`,
      file: 'src/config.ts',
      start_line: n,
      end_line: n,
      rationale: 'because',
      confidence: 0.9,
      kind: 'finding',
    })),
  };
}

/**
 * Scriptable stub `LLMProvider`. `respond` gets the full prompt text and the
 * 0-based call index and returns the structured answer (or throws). Every
 * prompt is recorded in `prompts`. Never touches the network.
 */
export class StubLLM implements LLMProvider {
  readonly id = 'openai' as const;
  prompts: string[] = [];
  constructor(
    private respond: (prompt: string, call: number) => unknown | Promise<unknown> = () => reviewAnswer([]),
  ) {}

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    return { text: '', model: req.model, tokensIn: 1, tokensOut: 1, costUsd: 0 };
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const prompt = req.messages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
    const call = this.prompts.push(prompt) - 1;
    const answer = await this.respond(prompt, call);
    const data = (req.schema as z.ZodType<T>).parse(answer);
    return { data, model: req.model, tokensIn: 10, tokensOut: 5, costUsd: 0.01, raw: JSON.stringify(answer), attempts: 1 };
  }
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => []);
  }
}

export async function createAgent(app: FastifyInstance, name = 'Eval Agent') {
  const res = await app.inject({
    method: 'POST',
    url: '/agents',
    payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'You are a strict reviewer.' },
  });
  if (res.statusCode !== 201) throw new Error(`agent create failed: ${res.body}`);
  return res.json() as { id: string; version: number };
}

export function caseBody(over: Record<string, unknown> = {}) {
  return {
    name: 'manual case',
    input_diff: CONFIG_DIFF,
    input_meta: { title: 'PR title', body: 'PR body' },
    expected_output: [{ expect: 'must_find', file: 'src/config.ts', start_line: 11 }],
    notes: null,
    ...over,
  };
}

/** Poll `GET /eval-runs/:id` (bounded, no fixed sleep) until the run leaves `running`. */
export async function waitForEvalRun(app: FastifyInstance, runId: string, timeoutMs = 10_000) {
  const start = Date.now();
  for (;;) {
    const res = await app.inject({ method: 'GET', url: `/eval-runs/${runId}` });
    const body = res.json();
    if (res.statusCode === 200 && body.run.status !== 'running') return body;
    if (Date.now() - start > timeoutMs) throw new Error(`eval run ${runId} still running: ${res.body}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Poll a single-case result (via `GET /eval-cases/:id` latest_result) until finished. */
export async function waitForCaseResult(app: FastifyInstance, caseId: string, timeoutMs = 10_000) {
  const start = Date.now();
  for (;;) {
    const body = (await app.inject({ method: 'GET', url: `/eval-cases/${caseId}` })).json();
    if (body.latest_result && body.latest_result.status !== 'running') return body.latest_result;
    if (Date.now() - start > timeoutMs) throw new Error(`case ${caseId} result still running`);
    await new Promise((r) => setTimeout(r, 25));
  }
}
