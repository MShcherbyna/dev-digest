import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CASE_BODY_LIMIT_BYTES, RATE_LIMIT } from './constants.js';
import type { EvalLog } from './ports.js';
import {
  AgentEvalDashboardResponse,
  CompareQuery,
  CompareResponse,
  EvalAgentRun,
  EvalDashboardResponse,
  RangeQuery,
  RunAllResponse,
  EvalCase,
  EvalCaseBody,
  EvalCaseFindingOverride,
  EvalCaseSummary,
  EvalRunDetailResponse,
  ListRunsQuery,
  OkResponse,
  StartAgentRunResponse,
  StartCaseRunResponse,
} from './schemas.js';

/**
 * Eval module (part 1). Routes only parse, call one `container.eval` method and
 * set the status code; business rules and error mapping live in the service.
 *   POST   /findings/:id/eval-case      create a case from a decided finding
 *   GET    /findings/:id/eval-case/preview  preview that case without persisting it
 *   GET    /agents/:id/eval-cases       list cases (newest first)
 *   POST   /agents/:id/eval-cases       create a manual case
 *   GET    /eval-cases/:id              one case
 *   PUT    /eval-cases/:id              replace a case
 *   DELETE /eval-cases/:id              delete a case (+ its results)
 *   POST   /eval-cases/:id/run          run one case (202, background)
 *   POST   /agents/:id/eval-runs        run all of the agent's cases (202, background)
 *   GET    /eval-runs/:id               run detail + progress + per-case results
 *   GET    /agents/:id/eval-runs        runs, newest first (?since=)
 * Part 2:
 *   GET    /eval/dashboard              all-agents cards + recent runs
 *   GET    /agents/:id/eval-dashboard   per-agent dashboard (?range=7d|30d|90d|all)
 *   GET    /eval-runs/compare           two finished runs of one agent (?a=&b=)
 *   POST   /eval-runs/all               start a run for every eligible agent (202)
 * Per-route rate limits only take effect where app.ts registers
 * @fastify/rate-limit, i.e. every nodeEnv except `test`.
 */
export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const logOf = (req: { log: EvalLog }): EvalLog => ({
    info: (obj, msg) => req.log.info(obj, msg),
    warn: (obj, msg) => req.log.warn(obj, msg),
  });

  app.post(
    '/findings/:id/eval-case',
    {
      schema: { params: IdParams, body: EvalCaseFindingOverride.nullish(), response: { 201: EvalCase } },
      config: { rateLimit: RATE_LIMIT },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const created = await container.eval.createFromFinding(workspaceId, req.params.id, req.body);
      return reply.code(201).send(created);
    },
  );

  app.get(
    '/findings/:id/eval-case/preview',
    { schema: { params: IdParams, response: { 200: EvalCaseBody } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.eval.previewFromFinding(workspaceId, req.params.id);
    },
  );

  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalCaseSummary) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.eval.listCases(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-cases',
    {
      bodyLimit: CASE_BODY_LIMIT_BYTES,
      schema: { params: IdParams, body: EvalCaseBody, response: { 201: EvalCase } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const created = await container.eval.createCase(workspaceId, req.params.id, req.body);
      return reply.code(201).send(created);
    },
  );

  app.get(
    '/eval-cases/:id',
    { schema: { params: IdParams, response: { 200: EvalCase } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.eval.getCase(workspaceId, req.params.id);
    },
  );

  app.put(
    '/eval-cases/:id',
    {
      bodyLimit: CASE_BODY_LIMIT_BYTES,
      schema: { params: IdParams, body: EvalCaseBody, response: { 200: EvalCase } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.eval.updateCase(workspaceId, req.params.id, req.body);
    },
  );

  app.delete(
    '/eval-cases/:id',
    { schema: { params: IdParams, response: { 200: OkResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      await container.eval.deleteCase(workspaceId, req.params.id);
      return { ok: true as const };
    },
  );

  app.post(
    '/eval-cases/:id/run',
    {
      schema: { params: IdParams, response: { 202: StartCaseRunResponse } },
      config: { rateLimit: RATE_LIMIT },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const started = await container.eval.startCaseRun(workspaceId, req.params.id, logOf(req));
      return reply.code(202).send(started);
    },
  );

  app.post(
    '/eval-cases/:id/cancel',
    { schema: { params: IdParams, response: { 200: OkResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      await container.eval.cancelCase(workspaceId, req.params.id);
      return { ok: true as const };
    },
  );

  app.post(
    '/eval-runs/:id/cancel',
    { schema: { params: IdParams, response: { 200: OkResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      await container.eval.cancelRun(workspaceId, req.params.id);
      return { ok: true as const };
    },
  );

  app.post(
    '/agents/:id/eval-runs',
    {
      schema: { params: IdParams, response: { 202: StartAgentRunResponse } },
      config: { rateLimit: RATE_LIMIT },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const started = await container.eval.startAgentRun(workspaceId, req.params.id, logOf(req));
      return reply.code(202).send(started);
    },
  );

  app.get(
    '/eval-runs/:id',
    { schema: { params: IdParams, response: { 200: EvalRunDetailResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.eval.getRun(workspaceId, req.params.id);
    },
  );

  app.get(
    '/agents/:id/eval-runs',
    {
      schema: { params: IdParams, querystring: ListRunsQuery, response: { 200: z.array(EvalAgentRun) } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.eval.listRuns(workspaceId, req.params.id, req.query.since);
    },
  );

  app.get(
    '/eval/dashboard',
    { schema: { response: { 200: EvalDashboardResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.eval.dashboard(workspaceId);
    },
  );

  app.get(
    '/agents/:id/eval-dashboard',
    {
      schema: { params: IdParams, querystring: RangeQuery, response: { 200: AgentEvalDashboardResponse } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.eval.agentDashboard(workspaceId, req.params.id, req.query.range);
    },
  );

  // Static path: wins over `/eval-runs/:id` in the router.
  app.get(
    '/eval-runs/compare',
    { schema: { querystring: CompareQuery, response: { 200: CompareResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.eval.compare(workspaceId, req.query.a, req.query.b);
    },
  );

  app.post(
    '/eval-runs/all',
    { schema: { response: { 202: RunAllResponse } }, config: { rateLimit: RATE_LIMIT } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const result = await container.eval.runAll(workspaceId, logOf(req));
      return reply.code(202).send(result);
    },
  );
}
