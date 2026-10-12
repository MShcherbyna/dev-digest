import { StoredBrief } from '../modules/brief/schemas.js';

/**
 * Demo fixtures for PR #482: unified-diff patches for `pr_files` and the stored
 * PR Brief (`pr_brief.json`). Mirrors the design screenshots (Overview brief,
 * Files-changed deep link). Every brief `file:line` ref lies inside a hunk of
 * the matching patch below, so it survives grounding if the brief is
 * regenerated (hunk head-side ranges are noted per patch).
 */

/** Head-side hunks: 10-18 (+12..14) and 24-55 (+52). */
const RATELIMIT_PATCH = `@@ -10,6 +10,9 @@
 import type { Req, Res, Next } from '../types';
 import { redis } from '../redis';
 import { log, metrics, audit } from '../observability';
+const WINDOW_MS = 60_000;
+const MAX_REQUESTS = 100;
+const authHeader = 'x-api-key';
 export function bucketKey(req: Req): string {
   return \`rl:\${req.ip}\`;
 }
@@ -21,31 +24,32 @@
 export async function rateLimit(req: Req, res: Res, next: Next) {
   const key = bucketKey(req);
   const now = Date.now();
   const bucket = await redis.hgetall(key);
   const tokens = Number(bucket.tokens ?? MAX_REQUESTS);
   const last = Number(bucket.last ?? now);
   const refill = Math.floor((now - last) / WINDOW_MS) * MAX_REQUESTS;
   const available = Math.min(MAX_REQUESTS, tokens + refill);
   if (available > 0) {
     await redis.hset(key, { tokens: available - 1, last: now });
     return next();
   }
   const retryAfter = Math.ceil(WINDOW_MS / 1000);
   await redis.hset(key, { tokens: 0, last });
   await redis.expire(key, retryAfter);
   metrics.increment('ratelimit.blocked');
   log.warn({ key, retryAfter }, 'rate limit exceeded');
   res.setHeader('X-RateLimit-Remaining', '0');
   res.setHeader('X-RateLimit-Limit', String(MAX_REQUESTS));
   res.setHeader('X-RateLimit-Window', String(WINDOW_MS));
   res.setHeader('Vary', authHeader);
   res.setHeader('Cache-Control', 'no-store');
   res.setHeader('Content-Type', 'application/json');
   res.setHeader('X-Request-Id', req.id);
   log.debug({ key, available }, 'bucket empty');
   audit('ratelimit.blocked', { key });
   const body = { error: 'rate_limited' };
   log.info({ key }, 'responding 429');
+  return res.status(429).json(body);
 }
 export const limiter = rateLimit;
 export default rateLimit;
`;

/** Head-side hunk 60-74 (+61, +68, +73). */
const WEBHOOKS_PATCH = `@@ -60,12 +60,15 @@
 export async function webhookHandler(req: Req, res: Res) {
+  const target = req.body.callback_url;
   const account = await db.accounts.find(req.accountId);
   if (!account) {
     return res.status(404).end();
   }
   const event = parseEvent(req.body);
   log.info({ event: event.type }, 'webhook received');
+  const token = account.apiToken;
   const payload = serialize(event);
   const signature = sign(payload);
   res.setHeader('X-Signature', signature);
   res.setHeader('X-Event', event.type);
+  await fetch(target, { headers: { Authorization: token } });
   return res.status(202).end();
`;

/** Head-side hunk 10-14 (+12). */
const CONFIG_PATCH = `@@ -10,4 +10,5 @@
 export const config = {
   port: Number(process.env.PORT ?? 3000),
+  stripeKey: 'sk_live_EXAMPLEEXAMPLEEXAMPLE',
   redisUrl: process.env.REDIS_URL,
 };
`;

/** Head-side hunk 44-49 (+46). */
const USERS_PATCH = `@@ -44,5 +44,6 @@
 export async function listUsers(req: Req, res: Res) {
   const users = await db.users.findMany();
+  for (const u of users) u.posts = await db.posts.findMany({ userId: u.id });
   return res.json(users);
 }
`;

/** Head-side hunk 31-38 (+34..36, line 34 is the ioredis dependency). */
const PACKAGE_JSON_PATCH = `@@ -31,6 +31,8 @@
     "dotenv": "^16.4.5",
     "express": "^4.19.2",
     "helmet": "^7.1.0",
-    "pg": "^8.11.0",
+    "ioredis": "^5.4.1",
+    "pg": "^8.12.0",
+    "rate-limiter-flexible": "^5.0.3",
     "pino": "^9.0.0",
     "zod": "^3.23.0"
`;

/** 9 files so the stored brief's `files_total` matches `pull_requests.files_count`. */
export const PR_482_FILES: Array<{
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}> = [
  { path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0, patch: RATELIMIT_PATCH },
  { path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6, patch: WEBHOOKS_PATCH },
  { path: 'src/config.ts', additions: 4, deletions: 0, patch: CONFIG_PATCH },
  { path: 'src/api/users.ts', additions: 7, deletions: 2, patch: USERS_PATCH },
  { path: 'package.json', additions: 3, deletions: 1, patch: PACKAGE_JSON_PATCH },
  { path: 'src/api/public/index.ts', additions: 12, deletions: 2, patch: null },
  { path: 'src/server.ts', additions: 8, deletions: 1, patch: null },
  { path: 'test/ratelimit.test.ts', additions: 72, deletions: 0, patch: null },
  { path: 'README.md', additions: 26, deletions: 0, patch: null },
];

/** Builds the seeded `pr_brief.json`; throws at seed time if it drifts from the contract. */
export function buildSeedBrief(): StoredBrief {
  return StoredBrief.parse({
    summary:
      'Adds a Redis-backed token-bucket rate limiter in front of the public API and answers 429 when the bucket is empty. The same change also forwards webhook credentials to a caller-supplied URL and commits a live Stripe key.',
    intent: {
      intent:
        'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      in_scope: [
        'Add middleware for rate limiting',
        'Apply to /api/public/* routes',
        'Return 429 with Retry-After header',
      ],
      out_of_scope: [
        'Authentication changes',
        'Adding new endpoints',
        'Logging / observability for the limiter',
      ],
    },
    blast: {
      changed_symbols: [
        { name: 'rateLimit', file: 'src/middleware/ratelimit.ts', kind: 'function' },
        { name: 'bucketKey', file: 'src/middleware/ratelimit.ts', kind: 'function' },
      ],
      downstream: [
        {
          symbol: 'rateLimit',
          callers: [
            { name: 'registerPublicRoutes', file: 'src/api/public/index.ts', line: 23 },
            { name: 'webhookHandler', file: 'src/api/public/webhooks.ts', line: 45 },
            { name: 'healthHandler', file: 'src/api/public/health.ts', line: 11 },
            { name: 'bootstrap', file: 'src/server.ts', line: 88 },
          ],
          endpoints_affected: [
            'GET /api/public/items',
            'POST /api/public/webhooks',
            'GET /api/public/health',
          ],
          crons_affected: ['reset-rate-buckets (hourly)'],
        },
        {
          symbol: 'bucketKey',
          callers: [
            { name: 'rateLimit', file: 'src/middleware/ratelimit.ts', line: 22 },
            { name: 'resetBuckets', file: 'src/jobs/reset-rate-buckets.ts', line: 9 },
          ],
          endpoints_affected: [],
          crons_affected: [],
        },
      ],
      summary:
        'rateLimit() sits in front of every public route; bucketKey() is shared with the hourly bucket-reset cron.',
    },
    risks: {
      risks: [
        {
          kind: 'security',
          title: 'Auth surface touched',
          explanation:
            'The limiter keys buckets on request identity and adds an x-api-key header dependency in front of public routes.',
          severity: 'high',
          file_refs: ['src/middleware/ratelimit.ts:12-18'],
        },
        {
          kind: 'dependency',
          title: 'New dependency: ioredis',
          explanation: 'ioredis is added as a runtime dependency; Redis becomes required to serve public traffic.',
          severity: 'medium',
          file_refs: ['package.json:34'],
        },
        {
          kind: 'performance',
          title: 'Adds Redis round-trip per request',
          explanation: 'Every public request now performs an HGETALL and an HSET against Redis before the handler runs.',
          severity: 'medium',
          file_refs: ['src/middleware/ratelimit.ts:40-52'],
        },
      ],
    },
    history: { history: [] },
    review_focus: [
      {
        file: 'src/config.ts',
        line: 12,
        reason: 'live Stripe key (sk_live_...) committed in plaintext',
      },
      {
        file: 'src/api/public/webhooks.ts',
        line: 61,
        reason: 'request callback_url forwards the account token to a caller-controlled URL',
      },
      {
        file: 'src/middleware/ratelimit.ts',
        line: 52,
        reason: '429 branch omits the Retry-After header the PR scope promises',
      },
      {
        file: 'src/api/users.ts',
        line: 46,
        reason: 'N+1 query — one posts lookup per user, hit harder under the new limiter',
      },
    ],
    head_sha: 'a1b2c3d4e5f6',
    generated_at: new Date().toISOString(),
    provider: 'openai',
    model: 'gpt-4.1',
    tokens_in: 8200,
    tokens_out: 1300,
    cost_usd: 0.014,
    spec_docs: [],
    truncated: false,
    files_total: PR_482_FILES.length,
    files_sent: PR_482_FILES.length,
  });
}
