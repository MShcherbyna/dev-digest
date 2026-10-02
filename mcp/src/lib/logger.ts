/**
 * stderr-only JSON-lines logger. stdout is reserved for JSON-RPC frames, so
 * nothing in this package may write there.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY = /token|key|secret|authorization/i;

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : v;
  }
  return out;
}

export function createLogger(level: LogLevel = 'info'): Logger {
  const write = (lvl: LogLevel, msg: string, fields?: Record<string, unknown>): void => {
    if (ORDER[lvl] < ORDER[level]) return;
    const line = JSON.stringify({ level: lvl, time: new Date().toISOString(), msg, ...redact(fields ?? {}) });
    process.stderr.write(`${line}\n`);
  };
  return {
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
  };
}

export const nullLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
