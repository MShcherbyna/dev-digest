/** Pure shaping of repo files into prompt facts. Secret VALUES are discarded here. */
import { README_MAX_CHARS } from './constants.js';

/** Script NAMES of a package.json (values are never passed on). */
export function scriptsOf(packageJsonText: string): string[] {
  try {
    const parsed: unknown = JSON.parse(packageJsonText);
    if (typeof parsed !== 'object' || parsed === null) return [];
    const scripts = (parsed as { scripts?: unknown }).scripts;
    if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts)) return [];
    const entries = Object.entries(scripts as Record<string, unknown>);
    if (!entries.every(([, v]) => typeof v === 'string')) return [];
    return entries.map(([k]) => k);
  } catch {
    return [];
  }
}

/** Variable NAMES declared in a `.env.example`-style file. Values are discarded. */
export function envVarNames(text: string): string[] {
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m && !names.includes(m[1]!)) names.push(m[1]!);
  }
  return names;
}

/** At most README_MAX_CHARS characters, cut on a line boundary. */
export function truncateReadme(text: string): string {
  if (text.length <= README_MAX_CHARS) return text;
  const cut = text.slice(0, README_MAX_CHARS);
  const nl = cut.lastIndexOf('\n');
  return nl > 0 ? cut.slice(0, nl) : cut;
}

export function formatChains(chains: string[][]): string {
  return chains.map((c) => c.join(' -> ')).join('\n');
}
