import { DEFAULT_DOC_GLOB } from './constants.js';

/**
 * Hand-written glob matcher over forward-slash relative paths. Supports only
 * `**`, `*`, `?` and (non-nested) `{a,b}`; everything else is rejected so a
 * configured glob can never widen discovery in surprising ways.
 */
const REJECTED_CHARS = /[[\]()!\\|^$+@]/;

class GlobError extends Error {}

function escapeLiteral(c: string): string {
  return /[.*+?^${}()|[\]\\/]/.test(c) ? `\\${c}` : c;
}

function translate(pattern: string, inBrace: boolean): string {
  let out = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i]!;
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          out += '(?:.*/)?'; // `**/` also matches zero segments
          i += 3;
        } else {
          out += '.*';
          i += 2;
        }
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      out += '[^/]';
      i += 1;
    } else if (c === '{') {
      if (inBrace) throw new GlobError('nested braces');
      const end = pattern.indexOf('}', i);
      if (end === -1) throw new GlobError('unbalanced braces');
      const alts = pattern.slice(i + 1, end).split(',');
      out += `(?:${alts.map((a) => translate(a, true)).join('|')})`;
      i = end + 1;
    } else if (c === '}') {
      throw new GlobError('unbalanced braces');
    } else {
      out += escapeLiteral(c);
      i += 1;
    }
  }
  return out;
}

/** Throws nothing: returns a RegExp or `null` when the pattern is invalid. */
export function compileGlob(pattern: string): RegExp | null {
  if (pattern.trim().length === 0) return null;
  if (pattern.startsWith('/') || REJECTED_CHARS.test(pattern)) return null;
  if (pattern.split('/').includes('..')) return null;
  try {
    return new RegExp(`^${translate(pattern, false)}$`);
  } catch {
    return null;
  }
}

export interface ResolvedGlob {
  glob: string;
  regex: RegExp;
  /** The raw configured value that was rejected (AC-3), if any. */
  rejected?: string;
}

/** Configured glob (or undefined when unset) → usable glob, default on invalid/empty. */
export function resolveGlob(raw: string | undefined): ResolvedGlob {
  const def = compileGlob(DEFAULT_DOC_GLOB)!;
  if (raw === undefined) return { glob: DEFAULT_DOC_GLOB, regex: def };
  const regex = compileGlob(raw);
  if (!regex) return { glob: DEFAULT_DOC_GLOB, regex: def, rejected: raw };
  return { glob: raw, regex };
}
