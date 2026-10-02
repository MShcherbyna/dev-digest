import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { GatewayNotFoundError, GatewayResponseError, GatewayUnavailableError } from '../gateway/errors.js';
import { toCallContext, type CallContext, type RequestExtraLike } from './call-context.js';
import type { InflightTracker } from './inflight.js';
import type { Logger } from './logger.js';
import { BusinessError, businessError } from './result.js';
import { sanitizeText } from './sanitize.js';

/** Maps any thrown value to a recovery-instruction isError result. Never throws. */
export function toErrorResult(err: unknown, logger: Logger): CallToolResult {
  if (err instanceof BusinessError) return businessError(err.parts);

  if (err instanceof GatewayUnavailableError) {
    if (err.kind === 'api_down') {
      return businessError({
        what: `DevDigest API is not reachable at ${err.baseUrl}`,
        expected: 'the DevDigest API running locally',
        example: 'run ./scripts/dev.sh (or pnpm dev in server/)',
        next: 'retry this tool once the API is up',
      });
    }
    if (err.kind === 'db_down') {
      return businessError({
        what: 'DevDigest API is up but Postgres is not ready',
        expected: 'the Postgres container running',
        example: 'open -a Docker, then docker compose up -d',
        next: 'retry this tool once Postgres is ready',
      });
    }
    return businessError({
      what: `DevDigest API did not answer within ${err.timeoutMs ?? 'the configured'} ms`,
      expected: 'a responsive local API',
      example: 'check the API terminal for errors, or raise DEVDIGEST_MCP_HTTP_TIMEOUT_MS',
      next: 'retry the tool; for devdigest_run_agent_on_pr use devdigest_get_findings first, a run may already be in progress',
    });
  }

  if (err instanceof GatewayNotFoundError) {
    return businessError({
      what: `DevDigest could not find the requested ${err.what}`,
      expected: 'an existing repo, pull request or run',
      example: 'repo: "acme/payments-api", pr: 482',
      next: 'open the repo in DevDigest to import it, then retry',
    });
  }

  if (err instanceof GatewayResponseError) {
    return businessError({
      what: `DevDigest API error (${err.code}, HTTP ${err.status}): ${sanitizeText(err.message, 300)}`,
      expected: 'a successful API response',
      example: 'check the API terminal output for details',
      next: 'fix the cause named above and retry, or report it if it persists',
    });
  }

  logger.error('unexpected handler error', {
    error: err instanceof Error ? (err.stack ?? err.message) : String(err),
  });
  return businessError({
    what: 'Unexpected DevDigest MCP error; details were written to the MCP server log (stderr)',
    expected: 'a successful tool call',
    example: 'claude --debug shows the server log',
    next: 'retry once; if it persists, report it',
  });
}

export interface HandlerOptions {
  inflight?: InflightTracker | undefined;
  /** Aborted at shutdown so waiting handlers return promptly with a partial (running) result. */
  shutdown?: AbortSignal | undefined;
}

/** Mandatory wrapper for every tool handler: no exception escapes; hands the tool a plain CallContext. */
export function safeHandler<Args>(
  fn: (args: Args, ctx: CallContext) => Promise<CallToolResult>,
  logger: Logger,
  opts: HandlerOptions = {},
): (args: Args, extra: RequestExtraLike) => Promise<CallToolResult> {
  const run = async (args: Args, extra: RequestExtraLike): Promise<CallToolResult> => {
    try {
      return await fn(args, toCallContext(extra, opts.shutdown));
    } catch (err) {
      return toErrorResult(err, logger);
    }
  };
  return (args, extra) => (opts.inflight ? opts.inflight.track(run(args, extra)) : run(args, extra));
}
