import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Success: compact JSON text block + identical structuredContent. */
export function ok<T extends Record<string, unknown>>(structured: T): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
}

export interface BusinessErrorParts {
  what: string;
  expected: string;
  example: string;
  next: string;
}

const stop = (s: string): string => s.trim().replace(/[.\s]+$/, '');

/** Recovery-instruction error: text only, never a stack trace, no structuredContent. */
export function businessError(p: BusinessErrorParts): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `${stop(p.what)}. Expected: ${stop(p.expected)}. Example: ${stop(p.example)}. Next: ${stop(p.next)}.`,
      },
    ],
  };
}

/** Thrown by tool helpers to short-circuit into a business error; safeHandler converts it. */
export class BusinessError extends Error {
  constructor(readonly parts: BusinessErrorParts) {
    super(parts.what);
    this.name = 'BusinessError';
  }
}
