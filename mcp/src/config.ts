import { z } from 'zod';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const LoopbackUrl = z
  .string()
  .url()
  .refine(
    (v) => {
      try {
        return LOOPBACK_HOSTS.has(new URL(v).hostname);
      } catch {
        return false;
      }
    },
    { message: 'must point at localhost, 127.0.0.1 or ::1 (the DevDigest API has no auth)' },
  );

const Ms = (def: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(def);

const EnvSchema = z.object({
  DEVDIGEST_API_URL: LoopbackUrl.default('http://localhost:3001'),
  DEVDIGEST_WEB_URL: z.string().url().default('http://localhost:3000'),
  DEVDIGEST_MCP_HTTP_TIMEOUT_MS: Ms(10_000, 500, 120_000),
  DEVDIGEST_MCP_RESOLVE_TIMEOUT_MS: Ms(30_000, 500, 300_000),
  DEVDIGEST_MCP_RUN_WAIT_MS: Ms(120_000, 0, 600_000),
  DEVDIGEST_MCP_POLL_MS: Ms(3_000, 50, 60_000),
  DEVDIGEST_MCP_MAX_RUNS: z.coerce.number().int().min(1).max(100).default(5),
  DEVDIGEST_MCP_RUN_WINDOW_MS: Ms(600_000, 1_000, 86_400_000),
  DEVDIGEST_MCP_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export interface Config {
  apiUrl: string;
  webUrl: string;
  httpTimeoutMs: number;
  resolveTimeoutMs: number;
  runWaitMs: number;
  pollMs: number;
  maxRuns: number;
  runWindowMs: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export class ConfigError extends Error {}

/** Parses env; throws ConfigError (fail-closed) on anything invalid. Reads no secrets. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  // An empty string (e.g. unset `${VAR}` expansion) should fall back to the default.
  const cleaned: Record<string, string | undefined> = {};
  for (const k of Object.keys(EnvSchema.shape)) {
    const v = env[k];
    if (v !== undefined && v !== '') cleaned[k] = v;
  }
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigError(`Invalid DevDigest MCP configuration: ${msg}`);
  }
  const e = parsed.data;
  return {
    apiUrl: e.DEVDIGEST_API_URL.replace(/\/+$/, ''),
    webUrl: e.DEVDIGEST_WEB_URL.replace(/\/+$/, ''),
    httpTimeoutMs: e.DEVDIGEST_MCP_HTTP_TIMEOUT_MS,
    resolveTimeoutMs: e.DEVDIGEST_MCP_RESOLVE_TIMEOUT_MS,
    runWaitMs: e.DEVDIGEST_MCP_RUN_WAIT_MS,
    pollMs: e.DEVDIGEST_MCP_POLL_MS,
    maxRuns: e.DEVDIGEST_MCP_MAX_RUNS,
    runWindowMs: e.DEVDIGEST_MCP_RUN_WINDOW_MS,
    logLevel: e.DEVDIGEST_MCP_LOG_LEVEL,
  };
}
