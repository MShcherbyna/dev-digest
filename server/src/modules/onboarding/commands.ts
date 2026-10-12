/**
 * Pure checker for model-proposed run commands: a command that names a script
 * or compose service must name a DECLARED one. Anything else is kept.
 */
import {
  COMPOSE_SERVICE_SUBCOMMANDS,
  COMPOSE_GLOBAL_VALUE_FLAGS,
  COMPOSE_SUB_VALUE_FLAGS,
  NPM_SCRIPT_ALIASES,
  PM_BUILTINS,
  PM_VALUE_FLAGS,
} from './constants.js';

export type CommandCheck = { ok: true } | { ok: false; reason: 'undeclared_script' | 'undeclared_service' };

/** Drop an unquoted ` #...` suffix. Only for checking; the stored command keeps its comment. */
export function stripComment(cmd: string): string {
  let quote: string | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]!;
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(cmd[i - 1]!))) return cmd.slice(0, i).trimEnd();
  }
  return cmd.trimEnd();
}

export function splitSegments(cmd: string): string[] {
  return cmd
    .split(/&&|\|\||;|\|/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

function tokensOf(segment: string): string[] {
  const toks = segment.split(/\s+/).filter((t) => t !== '');
  while (toks.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[0]!)) toks.shift();
  return toks;
}

/** Non-flag tokens, skipping the values of `valueFlags`. */
function positional(toks: string[], valueFlags: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.startsWith('-')) {
      if (valueFlags.has(t)) i++;
      continue;
    }
    out.push(t);
  }
  return out;
}

function scriptRef(pm: 'pnpm' | 'yarn' | 'bun' | 'npm', rest: string[]): string | null {
  const pos = positional(rest, PM_VALUE_FLAGS);
  const first = pos[0];
  if (first === undefined) return null;
  if (first === 'run' || first === 'run-script') return pos[1] ?? null;
  if (pm === 'npm') {
    if (NPM_SCRIPT_ALIASES.has(first)) return first;
    return null;
  }
  if (PM_BUILTINS[pm].has(first)) return null;
  return first;
}

function composeRefs(rest: string[]): string[] {
  // Global flags (with values) come before the sub-command.
  let i = 0;
  while (i < rest.length && rest[i]!.startsWith('-')) i += COMPOSE_GLOBAL_VALUE_FLAGS.has(rest[i]!) ? 2 : 1;
  const sub = rest[i];
  if (sub === undefined || !COMPOSE_SERVICE_SUBCOMMANDS.has(sub)) return [];
  const names = positional(rest.slice(i + 1), COMPOSE_SUB_VALUE_FLAGS);
  return sub === 'run' || sub === 'exec' ? names.slice(0, 1) : names;
}

export function checkCommand(
  cmd: string,
  declaredScripts: ReadonlySet<string>,
  declaredServices: ReadonlySet<string>,
): CommandCheck {
  for (const segment of splitSegments(stripComment(cmd))) {
    const toks = tokensOf(segment);
    const head = toks[0];
    if (head === undefined || head === 'cd') continue;
    let rest = toks.slice(1);
    if (head === 'pnpm' || head === 'yarn' || head === 'bun' || head === 'npm') {
      const ref = scriptRef(head, rest);
      if (ref !== null && !declaredScripts.has(ref)) return { ok: false, reason: 'undeclared_script' };
    } else if (head === 'docker' && rest[0] === 'compose') {
      rest = rest.slice(1);
      if (composeRefs(rest).some((s) => !declaredServices.has(s))) {
        return { ok: false, reason: 'undeclared_service' };
      }
    } else if (head === 'docker-compose') {
      if (composeRefs(rest).some((s) => !declaredServices.has(s))) {
        return { ok: false, reason: 'undeclared_service' };
      }
    }
  }
  return { ok: true };
}

/**
 * Top-level `services:` keys of a compose file, without a YAML parser. Fails
 * closed (empty set) on tabs, flow style, anchors or merge keys.
 */
export function readComposeServices(text: string): Set<string> {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^services:\s*(#.*)?$/.test(l));
  if (start === -1) return new Set();
  const out = new Set<string>();
  let indent: string | null = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === '' || /^\s*#/.test(line)) continue;
    if (/^\S/.test(line)) break; // next top-level key
    if (/^\s*\t|^\t/.test(line)) return new Set();
    if (/<<:|:\s*[&*]\w/.test(line)) return new Set();
    const m = /^(\s+)([A-Za-z0-9._-]+):\s*(#.*)?$/.exec(line);
    if (indent === null) {
      if (!m) {
        // first child is not a plain `name:` key (flow style, quoted key, ...)
        return new Set();
      }
      indent = m[1]!;
    }
    if (m && m[1] === indent) out.add(m[2]!);
  }
  return out;
}
