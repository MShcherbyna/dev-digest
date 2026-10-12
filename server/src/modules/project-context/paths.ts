/**
 * Single validation point for attached/requested document paths (AC-28
 * `invalid_path`). Used at API write, at run-time read and by the file endpoint.
 * Pure: realpath confinement is the fs adapter's job.
 */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\x00-\x1f\x7f\\"']/;

export type PathCheck = { ok: true; path: string } | { ok: false };

export function validateDocPath(p: unknown): PathCheck {
  if (typeof p !== 'string' || p.length === 0 || p.trim().length === 0) return { ok: false };
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return { ok: false };
  if (FORBIDDEN_CHARS.test(p)) return { ok: false };
  if (p.split('/').some((seg) => seg === '..' || seg === '')) return { ok: false };
  if (!p.endsWith('.md')) return { ok: false };
  return { ok: true, path: p };
}
