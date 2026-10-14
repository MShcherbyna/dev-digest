#!/usr/bin/env node
// Usage: node collect.mjs [--root <repo>] [--online] [--out <file.json>] [--composition-roots platform,...]
// Collects dependency facts for every package under <repo> (a dir with a package.json) and prints
// one JSON document: sizes (own + transitive), version drift, unused candidates, vendor drift,
// cross-package edges, internal module graph + cycles, licenses, and (with --online) audit/outdated.
// Also pre-renders the Mermaid graphs and size tables under `render` so the report is reproducible.
// Zero dependencies on purpose: it must run in a fresh clone before anything is installed.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const root = path.resolve(opt('--root', process.cwd()));
const online = args.includes('--online');
const outFile = opt('--out');

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'out', 'test-results', 'playwright-report']);
const SRC_EXT = /\.(m?[jt]sx?|cjs)$/;
const TEST_RE = /(\.test\.|\.spec\.|__tests__|\/test\/|\/tests\/)/;
const warnings = [];
const COMPOSITION_ROOTS = (opt('--composition-roots', 'platform')).split(',');

// ---------- helpers ----------
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const readdir = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };
const real = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
const fmt = (b) => b == null ? 'n/a' : b >= 2 ** 30 ? `${(b / 2 ** 30).toFixed(1)} GB` : b >= 2 ** 20 ? `${(b / 2 ** 20).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} kB` : `${b} B`;
const bar = (b, max, w = 20) => '█'.repeat(max ? Math.max(b > 0 ? 1 : 0, Math.round((b / max) * w)) : 0);
const idOf = (s) => s.replace(/[^A-Za-z0-9]/g, '_');

function run(cmd, cmdArgs, cwd, timeout = 120000) {
  try { return { ok: true, stdout: execFileSync(cmd, cmdArgs, { cwd, encoding: 'utf8', timeout, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { ok: false, stdout: e.stdout?.toString() ?? '', error: (e.stderr?.toString() || e.message).slice(0, 300) }; }
}

function walk(dir, accept, out = []) {
  for (const e of readdir(dir)) {
    if (SKIP_DIRS.has(e.name) || (e.isDirectory() && e.name.startsWith('.'))) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, accept, out);
    else if (e.isFile() && accept(e.name)) out.push(f);
  }
  return out;
}

const duCache = new Map();
function du(p) {
  if (!duCache.has(p)) {
    const r = run('du', ['-sk', p], root, 60000);
    duCache.set(p, r.ok ? parseInt(r.stdout.split('\t')[0], 10) * 1024 : 0);
  }
  return duCache.get(p);
}

// pnpm lays out <store>/.pnpm/<id>/node_modules/{<pkg>, <its deps as symlinks>}; walk those siblings.
function closure(realDir) {
  if (!realDir.includes(`${path.sep}.pnpm${path.sep}`)) return new Set([realDir]);
  const seen = new Set();
  const stack = [realDir];
  while (stack.length) {
    const d = stack.pop();
    if (seen.has(d)) continue;
    seen.add(d);
    const parent = path.dirname(d);
    const container = path.basename(parent).startsWith('@') ? path.dirname(parent) : parent;
    const sib = [];
    for (const e of readdir(container)) {
      if (e.name.startsWith('@')) for (const s of readdir(path.join(container, e.name))) sib.push(path.join(container, e.name, s.name));
      else sib.push(path.join(container, e.name));
    }
    for (const s of sib) { const r = real(s); if (r && r !== d && r.includes(`${path.sep}.pnpm${path.sep}`)) stack.push(r); }
  }
  return seen;
}
const sizeOf = (set) => [...set].reduce((a, d) => a + du(d), 0);

// ---------- discover packages ----------
const pkgDirs = readdir(root)
  .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name) && fs.existsSync(path.join(root, e.name, 'package.json')))
  .map((e) => e.name).sort();
if (!pkgDirs.length) { console.error(`no package.json found one level under ${root}`); process.exit(2); }

const packages = {};
const installedVersions = {}; // dep name -> version -> [pkg]

for (const name of pkgDirs) {
  const dir = path.join(root, name);
  const pj = readJson(path.join(dir, 'package.json'));
  const nm = path.join(dir, 'node_modules');
  const installed = fs.existsSync(nm);
  if (!installed) warnings.push(`${name}: node_modules missing — sizes unavailable (run pnpm install in ${name}/)`);

  // text corpus for unused detection (config files + sources, never package.json/lockfiles/markdown)
  const files = walk(dir, (n) => /\.(m?[jt]sx?|cjs|json|ya?ml|css|sh)$/.test(n) && !['package.json', 'pnpm-lock.yaml', 'package-lock.json'].includes(n));
  const corpus = files.map((f) => { try { return fs.statSync(f).size < 1e6 ? fs.readFileSync(f, 'utf8') : ''; } catch { return ''; } }).join('\n');
  const scriptsText = Object.values(pj.scripts ?? {}).join('\n');

  const deps = [];
  const kinds = [['dependencies', 'prod'], ['devDependencies', 'dev'], ['optionalDependencies', 'optional']];
  for (const [field, kind] of kinds) {
    for (const [dep, range] of Object.entries(pj[field] ?? {})) {
      const rp = installed ? real(path.join(nm, dep)) : null;
      const ipj = rp ? readJson(path.join(rp, 'package.json')) : null;
      const cl = rp ? closure(rp) : null;
      const version = ipj?.version ?? null;
      if (version) ((installedVersions[dep] ??= {})[version] ??= []).push(name);
      const bins = typeof ipj?.bin === 'string' ? [ipj.name] : Object.keys(ipj?.bin ?? {});
      const q = (n) => new RegExp(`['"\`]${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/[^'"\`]*)?['"\`]`);
      const base = dep.startsWith('@types/') ? dep.slice(7).replace('__', '/').replace(/^(?!.*\/)/, '') : null;
      const aliases = dep === 'eslint-config-next' ? ['next/core-web-vitals', 'next/typescript'] : [];
      const referenced = q(dep).test(corpus) || aliases.some((a) => corpus.includes(a)) || (base && q(base).test(corpus)) ||
        (base && /"types"\s*:/.test(corpus) && corpus.includes(`"${base}"`));
      const viaBin = bins.some((b) => new RegExp(`(^|[\\s&|;(])${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s]|$)`, 'm').test(scriptsText));
      deps.push({
        name: dep, kind, range, version,
        ownBytes: rp ? du(rp) : null,
        withDepsBytes: cl ? sizeOf(cl) : null,
        transitiveCount: cl ? cl.size - 1 : null,
        usage: referenced ? 'referenced' : viaBin ? 'used-via-script' : 'unused-candidate',
        _closure: cl,
        _peers: Object.keys(ipj?.peerDependencies ?? {}),
      });
    }
  }

  for (const d of deps) if (d.usage === 'unused-candidate' && deps.some((o) => o !== d && o._peers.includes(d.name))) d.usage = 'peer-of-direct-dep';
  const union = (list) => { const s = new Set(); for (const d of list) d._closure?.forEach((x) => s.add(x)); return s; };
  const prodSet = union(deps.filter((d) => d.kind !== 'dev'));
  const allSet = union(deps);
  packages[name] = {
    dir: name, version: pj.version ?? null, installed,
    counts: { prod: deps.filter((d) => d.kind === 'prod').length, dev: deps.filter((d) => d.kind === 'dev').length },
    totals: installed ? { prodBytes: sizeOf(prodSet), devOnlyBytes: sizeOf(allSet) - sizeOf(prodSet), uniqueBytes: sizeOf(allSet), nodeModulesBytes: du(nm) } : null,
    deps,
    localDeclared: deps.filter((d) => /^(file|link|workspace):/.test(d.range)).map((d) => d.name),
  };
}

// ---------- version drift ----------
const drift = Object.entries(installedVersions)
  .filter(([, v]) => Object.keys(v).length > 1)
  .map(([dep, v]) => ({ dep, versions: Object.entries(v).map(([version, pkgs]) => ({ version, pkgs })) }));
const rangeDrift = [];
{
  const byDep = {};
  for (const p of Object.values(packages)) for (const d of p.deps) ((byDep[d.name] ??= {})[d.range] ??= []).push(p.dir);
  for (const [dep, r] of Object.entries(byDep)) if (Object.keys(r).length > 1) rangeDrift.push({ dep, ranges: Object.entries(r).map(([range, pkgs]) => ({ range, pkgs })) });
}

// ---------- vendor drift ----------
const vendors = pkgDirs.filter((p) => fs.existsSync(path.join(root, p, 'src/vendor/shared')));
const vendorDrift = [];
for (let i = 1; i < vendors.length; i++) {
  const a = path.join(root, vendors[0], 'src/vendor/shared'), b = path.join(root, vendors[i], 'src/vendor/shared');
  const r = run('diff', ['-rq', a, b], root);
  vendorDrift.push({ a: `${vendors[0]}/src/vendor/shared`, b: `${vendors[i]}/src/vendor/shared`, identical: r.ok, differences: r.ok ? [] : r.stdout.trim().split('\n').map((l) => l.replaceAll(root + path.sep, '')) });
}

// ---------- import scanning: cross-package edges + internal module graph ----------
const SPEC_RE = /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g;
const edgeMap = new Map();
const addEdge = (from, to, kind, file) => {
  const k = `${from}|${to}|${kind}`;
  const e = edgeMap.get(k) ?? { from, to, kind, files: [] };
  e.files.push(file); edgeMap.set(k, e);
};
const internal = {};

const groupOf = (srcRoot, file) => {
  const parts = path.relative(srcRoot, file).split(path.sep);
  if (parts.length < 2) return null; // top-level file in src
  if (parts[0] === 'modules' || parts[0] === 'app') return parts.length > 2 ? `${parts[0] === 'modules' ? '' : 'app/'}${parts[1]}` : null;
  return parts[0];
};
const resolveSpec = (spec, fromFile, srcRoot, aliasSrc) => {
  if (spec.startsWith('.')) return path.resolve(path.dirname(fromFile), spec);
  if (aliasSrc && spec.startsWith('@/')) return path.join(srcRoot, spec.slice(2));
  return null;
};

for (const name of pkgDirs) {
  const dir = path.join(root, name);
  const srcRoot = path.join(dir, 'src');
  const aliasSrc = /"@\/\*"/.test(fs.existsSync(path.join(dir, 'tsconfig.json')) ? fs.readFileSync(path.join(dir, 'tsconfig.json'), 'utf8') : '');
  const files = walk(fs.existsSync(srcRoot) ? srcRoot : dir, (n) => SRC_EXT.test(n)).filter((f) => !TEST_RE.test(f) && !f.includes(`${path.sep}vendor${path.sep}`));
  const gEdges = new Map();
  for (const f of files) {
    const rel = path.relative(root, f);
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(SPEC_RE)) {
      const spec = m[1];
      const line = text.slice(0, m.index).split('\n').length;
      const loc = `${rel}:${line}`;
      const sc = spec.match(/^@devdigest\/([^/]+)(\/.*)?$/);
      if (sc) {
        if (sc[1] === 'shared') addEdge(name, 'vendor/shared', 'vendored-alias', loc);
        else if (pkgDirs.includes(sc[1])) addEdge(name, sc[1], sc[2] ? 'alias-deep-import' : 'alias', loc);
        continue;
      }
      const target = resolveSpec(spec, f, srcRoot, aliasSrc);
      if (!target) continue;
      const other = pkgDirs.find((p) => p !== name && (target + path.sep).startsWith(path.join(root, p) + path.sep));
      if (other) { addEdge(name, other, 'relative-cross-package', loc); continue; }
      if (!fs.existsSync(srcRoot)) continue;
      const gFrom = groupOf(srcRoot, f), gTo = groupOf(srcRoot, target + '.x'); // '.x' so a bare dir/file still has a group
      if (gFrom && gTo && gFrom !== gTo && gTo !== 'vendor') {
        const k = `${gFrom}|${gTo}`;
        const e = gEdges.get(k) ?? { from: gFrom, to: gTo, count: 0, sample: loc };
        e.count++; gEdges.set(k, e);
      }
    }
  }
  const edges = [...gEdges.values()];
  const nodes = [...new Set(edges.flatMap((e) => [e.from, e.to]))].sort();
  if (nodes.length < 2) continue;
  // Tarjan SCC -> cycles of 2+ groups. A composition root (DI container) legitimately imports every module,
  // so cycles are reported twice: all edges, and with the roots' outbound edges removed (the actionable set).
  const sccs = (es) => {
    const adj = Object.fromEntries(nodes.map((n) => [n, es.filter((e) => e.from === n).map((e) => e.to)]));
    let idx = 0; const st = [], on = new Set(), ix = {}, low = {}, found = [];
    const strong = (v) => {
      ix[v] = low[v] = idx++; st.push(v); on.add(v);
      for (const w of adj[v]) { if (ix[w] === undefined) { strong(w); low[v] = Math.min(low[v], low[w]); } else if (on.has(w)) low[v] = Math.min(low[v], ix[w]); }
      if (low[v] === ix[v]) { const c = []; let w; do { w = st.pop(); on.delete(w); c.push(w); } while (w !== v); if (c.length > 1) found.push(c.sort()); }
    };
    nodes.forEach((n) => ix[n] === undefined && strong(n));
    return found;
  };
  const roots = COMPOSITION_ROOTS.filter((r) => nodes.includes(r));
  const cycles = sccs(edges);
  const cyclesExcludingRoots = roots.length ? sccs(edges.filter((e) => !roots.includes(e.from))) : cycles;
  const fan = nodes.map((n) => ({ group: n, fanOut: edges.filter((e) => e.from === n).length, fanIn: edges.filter((e) => e.to === n).length }));
  internal[name] = { groups: nodes, edges, compositionRoots: roots, cycles, cyclesExcludingRoots, fan };
}

const edges = [...edgeMap.values()].map((e) => ({ ...e, count: e.files.length, files: e.files.slice(0, 3) }));
// Runtime edges are not visible in imports; these come from CLAUDE.md / README#architecture and must be re-verified.
const runtimeEdges = [
  { from: 'client', to: 'server', via: 'REST/SSE (README#architecture)' },
  { from: 'mcp', to: 'server', via: 'HTTP — "thin layer over the running API" (CLAUDE.md)' },
].filter((e) => pkgDirs.includes(e.from) && pkgDirs.includes(e.to));

// ---------- licenses (offline) + audit/outdated (online) ----------
const COPYLEFT = /(^|[^L])GPL|AGPL|LGPL|SSPL|BUSL|UNLICENSED|UNKNOWN/i;
for (const name of pkgDirs) {
  const p = packages[name]; if (!p.installed) continue;
  const r = run('pnpm', ['licenses', 'list', '--json', '--prod'], path.join(root, name), 90000);
  try {
    const j = JSON.parse(r.stdout);
    p.licenses = Object.fromEntries(Object.entries(j).map(([lic, list]) => [lic, list.length]));
    p.licenseFlags = Object.entries(j).filter(([lic]) => COPYLEFT.test(lic)).flatMap(([lic, list]) => list.map((x) => ({ license: lic, name: x.name, versions: x.versions })));
  } catch { p.licenses = null; warnings.push(`${name}: pnpm licenses unavailable (${(r.error ?? 'bad output').split('\n')[0]})`); }
  if (!online) continue;
  const au = run('pnpm', ['audit', '--json'], path.join(root, name), 120000);
  try {
    const j = JSON.parse(au.stdout);
    const adv = Object.values(j.advisories ?? {}).map((a) => ({ module: a.module_name, severity: a.severity, title: a.title, vulnerable: a.vulnerable_versions, patched: a.patched_versions, path: a.findings?.[0]?.paths?.[0] }));
    p.audit = { counts: j.metadata?.vulnerabilities ?? null, advisories: adv };
  } catch { p.audit = null; warnings.push(`${name}: pnpm audit unavailable (${(au.error ?? 'bad output').split('\n')[0]})`); }
  const ou = run('pnpm', ['outdated', '--format', 'json'], path.join(root, name), 120000);
  try { p.outdated = JSON.parse(ou.stdout || '{}'); } catch { p.outdated = null; warnings.push(`${name}: pnpm outdated unavailable (${(ou.error ?? 'bad output').split('\n')[0]})`); }
}

// ---------- render ----------
const render = { packageGraph: '', internalGraphs: {}, sizeTables: {}, topHeaviest: '' };
{
  const L = ['flowchart LR'];
  for (const n of pkgDirs) { const t = packages[n].totals; L.push(`  ${idOf(n)}["${n}<br/>${t ? fmt(t.prodBytes) + ' prod / ' + fmt(t.uniqueBytes) + ' total' : 'not installed'}"]`); }
  if (edges.some((e) => e.to === 'vendor/shared')) L.push('  vendor_shared(["vendor/shared<br/>@devdigest/shared"])');
  const styles = [];
  let i = 0;
  for (const e of edges) {
    const to = e.to === 'vendor/shared' ? 'vendor_shared' : idOf(e.to);
    const bad = e.kind === 'relative-cross-package' || e.kind === 'alias-deep-import';
    L.push(`  ${idOf(e.from)} ${e.kind === 'vendored-alias' ? '-.->' : bad ? '==>' : '-->'}|"${e.kind} ×${e.count}"| ${to}`);
    if (bad) styles.push(`  linkStyle ${i} stroke:#d33,stroke-width:3px`);
    i++;
  }
  for (const e of runtimeEdges) L.push(`  ${idOf(e.from)} -.->|"runtime: ${e.via.split(' ')[0]}"| ${idOf(e.to)}`);
  render.packageGraph = '```mermaid\n' + [...L, ...styles].join('\n') + '\n```';

  for (const [n, g] of Object.entries(internal)) {
    const M = ['flowchart LR'];
    g.groups.forEach((x) => M.push(`  ${idOf(x)}["${x}"]`));
    const inCycle = (e) => g.cyclesExcludingRoots.some((c) => c.includes(e.from) && c.includes(e.to));
    const sty = [];
    g.edges.forEach((e, k) => { M.push(`  ${idOf(e.from)} -->|${e.count}| ${idOf(e.to)}`); if (inCycle(e)) sty.push(`  linkStyle ${k} stroke:#d33,stroke-width:3px`); });
    render.internalGraphs[n] = '```mermaid\n' + [...M, ...sty].join('\n') + '\n```';
  }

  const all = Object.values(packages).flatMap((p) => p.deps.filter((d) => d.withDepsBytes != null).map((d) => ({ pkg: p.dir, ...d })));
  const maxAll = Math.max(1, ...all.map((d) => d.withDepsBytes));
  for (const p of Object.values(packages)) {
    const rows = p.deps.filter((d) => d.withDepsBytes != null).sort((a, b) => b.withDepsBytes - a.withDepsBytes);
    if (!rows.length) continue;
    const top = rows.slice(0, 10);
    const rest = rows.slice(10);
    const T = ['| Dependency | Kind | Version | Own | With transitive | Share of package | |', '|---|---|---|---|---|---|---|'];
    const tot = p.totals.uniqueBytes || 1;
    for (const d of top) T.push(`| \`${d.name}\` | ${d.kind} | ${d.version} | ${fmt(d.ownBytes)} | ${fmt(d.withDepsBytes)} | ${Math.round((d.withDepsBytes / tot) * 100)}% | ${bar(d.withDepsBytes, maxAll)} |`);
    if (rest.length) T.push(`| _${rest.length} more_ | | | | ${fmt(rest.reduce((a, d) => a + d.withDepsBytes, 0))} (overlaps) | | |`);
    render.sizeTables[p.dir] = T.join('\n');
  }
  const top = all.sort((a, b) => b.withDepsBytes - a.withDepsBytes).slice(0, 15);
  render.topHeaviest = ['| # | Package | Dependency | Kind | With transitive | |', '|---|---|---|---|---|---|', ...top.map((d, k) => `| ${k + 1} | ${d.pkg} | \`${d.name}\` | ${d.kind} | ${fmt(d.withDepsBytes)} | ${bar(d.withDepsBytes, maxAll)} |`)].join('\n');
}

// ---------- output ----------
const out = {
  generatedAt: new Date().toISOString(), root, online,
  note: 'Sizes are on-disk (du) of the pnpm virtual store; "with transitive" overlaps between deps (shared transitives are counted in each). Package totals are de-duplicated.',
  packages: Object.fromEntries(Object.entries(packages).map(([k, p]) => [k, { ...p, deps: p.deps.map(({ _closure, _peers, ...d }) => d) }])),
  versionDrift: drift, rangeDrift, vendorDrift, edges, runtimeEdges, internalGraph: internal, render, warnings,
};
const json = JSON.stringify(out, null, 2);
if (outFile) { fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true }); fs.writeFileSync(outFile, json); console.error(`wrote ${outFile} (${fmt(json.length)})`); }
else console.log(json);
