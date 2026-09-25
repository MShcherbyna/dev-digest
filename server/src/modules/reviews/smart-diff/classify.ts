import type { SmartDiffRole } from '@devdigest/shared';
import {
  BOILERPLATE_ANY_DIRS,
  BOILERPLATE_BASENAMES,
  BOILERPLATE_INFIXES,
  BOILERPLATE_ROOT_DIRS,
  BOILERPLATE_SUFFIXES,
  CLASSIFY_PRECEDENCE,
  DOCS_BASENAMES,
  DOCS_PREFIXES,
  DOCS_ROOT_DIRS,
  DOCS_SUFFIXES,
  TEST_ANY_DIRS,
  TEST_ROOT_DIRS,
  TEST_SUFFIXES,
  WIRING_BASENAMES,
  WIRING_DOCKER_COMPOSE_PREFIX,
  WIRING_DOCKER_COMPOSE_SUFFIX,
  WIRING_INFIXES,
  WIRING_PREFIXES,
  WIRING_ROOT_DIRS,
  WIRING_TSCONFIG_PREFIX,
  WIRING_TSCONFIG_SUFFIX,
} from './constants.js';

/**
 * Splits a normalised path into its directory segments and basename.
 * Normalisation: `\` becomes `/`, a leading `./` is stripped.
 */
function splitPath(path: string): { dirs: string[]; base: string } {
  const normalised = path.replace(/\\/g, '/').replace(/^\.\//, '');
  const segments = normalised.split('/').filter((s) => s.length > 0);
  const base = segments[segments.length - 1] ?? '';
  const dirs = segments.slice(0, -1);
  return { dirs, base };
}

function isBoilerplate(dirs: string[], base: string): boolean {
  if ((BOILERPLATE_BASENAMES as readonly string[]).includes(base)) return true;
  if (BOILERPLATE_SUFFIXES.some((suf) => base.endsWith(suf))) return true;
  if (BOILERPLATE_INFIXES.some((inf) => base.includes(inf))) return true;
  if (dirs.length > 0 && (BOILERPLATE_ROOT_DIRS as readonly string[]).includes(dirs[0]!)) return true;
  if (dirs.some((d) => (BOILERPLATE_ANY_DIRS as readonly string[]).includes(d))) return true;
  return false;
}

function isTest(dirs: string[], base: string): boolean {
  if (TEST_SUFFIXES.some((suf) => base.endsWith(suf))) return true;
  if (dirs.some((d) => (TEST_ANY_DIRS as readonly string[]).includes(d))) return true;
  if (dirs.length > 0 && (TEST_ROOT_DIRS as readonly string[]).includes(dirs[0]!)) return true;
  return false;
}

function isWiring(dirs: string[], base: string): boolean {
  if ((WIRING_BASENAMES as readonly string[]).includes(base)) return true;
  if (WIRING_INFIXES.some((inf) => base.includes(inf))) return true;
  if (WIRING_PREFIXES.some((pre) => base.startsWith(pre))) return true;
  if (base.startsWith(WIRING_TSCONFIG_PREFIX) && base.endsWith(WIRING_TSCONFIG_SUFFIX)) return true;
  if (base.startsWith(WIRING_DOCKER_COMPOSE_PREFIX) && base.endsWith(WIRING_DOCKER_COMPOSE_SUFFIX)) return true;
  if (dirs.length > 0 && (WIRING_ROOT_DIRS as readonly string[]).includes(dirs[0]!)) return true;
  return false;
}

function isDocs(dirs: string[], base: string): boolean {
  if (DOCS_SUFFIXES.some((suf) => base.endsWith(suf))) return true;
  if (dirs.length > 0 && (DOCS_ROOT_DIRS as readonly string[]).includes(dirs[0]!)) return true;
  if (DOCS_PREFIXES.some((pre) => base.startsWith(pre))) return true;
  if ((DOCS_BASENAMES as readonly string[]).includes(base)) return true;
  return false;
}

const PREDICATES: Record<Exclude<SmartDiffRole, 'core'>, (dirs: string[], base: string) => boolean> = {
  boilerplate: isBoilerplate,
  tests: isTest,
  wiring: isWiring,
  docs: isDocs,
};

/**
 * Classifies a repo-relative file path into a Smart Diff role. Gitignore-style
 * matching:
 * - A pattern without `/` (e.g. `*.lock`, `index.ts`, `.env*`, `*.config.*`,
 *   `*.md`, `README*`) matches the basename at any depth.
 * - A pattern of the form `x/**` (e.g. `dist/**`, `e2e/**`, `.github/**`) is
 *   root-anchored: only matches when `dirs[0] === x`.
 * - A pattern of the form `**\/dir/**` (only `__snapshots__`, `test`, `tests`,
 *   `__tests__`) matches when any directory segment equals `dir`.
 *
 * Roles are evaluated in `CLASSIFY_PRECEDENCE` order (first match wins);
 * `core` is the fallback. Matching is case-sensitive and uses only
 * `String.prototype` `startsWith`/`endsWith`/`includes`/`===` — no `RegExp`
 * built from the path (avoids ReDoS from untrusted input).
 */
export function classifyFile(path: string): SmartDiffRole {
  const { dirs, base } = splitPath(path);
  for (const role of CLASSIFY_PRECEDENCE) {
    if (PREDICATES[role](dirs, base)) return role;
  }
  return 'core';
}
