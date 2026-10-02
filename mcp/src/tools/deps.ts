import type { Config } from '../config.js';
import type { DevDigestGateway } from '../gateway/ports.js';
import type { InflightTracker } from '../lib/inflight.js';
import type { Logger } from '../lib/logger.js';
import { safeHandler } from '../lib/safe-handler.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { CallContext } from '../lib/call-context.js';
import type { Resolver } from '../lib/resolve.js';
import type { RunGuard } from '../lib/run-guard.js';

export interface ToolDeps {
  gateway: DevDigestGateway;
  resolver: Resolver;
  runGuard: RunGuard;
  config: Config;
  inflight?: InflightTracker;
  /** Aborted at process shutdown. */
  shutdown?: AbortSignal;
  logger: Logger;
  /** Test seam for the bounded wait. */
  clock?: { now: () => number; sleep: (ms: number, signal?: AbortSignal) => Promise<void> };
}

/** Wraps a tool handler with the mandatory safeHandler (+ in-flight tracking and shutdown signal). */
export function guarded<Args>(
  deps: ToolDeps,
  fn: (args: Args, ctx: CallContext) => Promise<CallToolResult>,
) {
  return safeHandler(fn, deps.logger, { inflight: deps.inflight, shutdown: deps.shutdown });
}
