export type UnavailableKind = 'api_down' | 'db_down' | 'timeout';

export class GatewayUnavailableError extends Error {
  constructor(
    readonly kind: UnavailableKind,
    readonly baseUrl: string,
    readonly timeoutMs?: number,
  ) {
    super(`DevDigest API unavailable: ${kind}`);
    this.name = 'GatewayUnavailableError';
  }
}

export class GatewayNotFoundError extends Error {
  constructor(readonly what: string) {
    super(`Not found: ${what}`);
    this.name = 'GatewayNotFoundError';
  }
}

export class GatewayResponseError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GatewayResponseError';
  }
}
