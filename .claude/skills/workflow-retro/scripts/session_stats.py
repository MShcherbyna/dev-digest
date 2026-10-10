#!/usr/bin/env python3
"""Deterministic stats for one Claude Code session and its subagents.

Usage: session_stats.py [session-id] [--project-dir DIR] [--spec F] [--plan F] [--report F...]
Default: latest session of the current project. Prints markdown to stdout.
"""
import json, os, re, sys, glob, statistics, collections
from datetime import datetime

DENY = re.compile(r"doesn't want to proceed|denied by the Claude Code auto mode|permission.{0,20}denied", re.I)

def opt(argv, name):
    """Values after --name up to the next --flag."""
    if name not in argv: return []
    out = []
    for a in argv[argv.index(name) + 1:]:
        if a.startswith("--"): break
        out.append(a)
    return out

def project_dir(argv):
    if "--project-dir" in argv:
        return argv[argv.index("--project-dir") + 1]
    slug = os.getcwd().replace("/", "-")
    return os.path.expanduser(f"~/.claude/projects/{slug}")

def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))

def analyse(path):
    """One transcript -> dict. Usage is deduped by message id (last wins)."""
    usage, tools, reads, errors, denied = {}, collections.Counter(), collections.Counter(), [], []
    models, first, last, tool_names_by_id = set(), None, None, {}
    for line in open(path):
        try: o = json.loads(line)
        except ValueError: continue
        t = o.get("timestamp")
        if t:
            first = first or t; last = t
        m = o.get("message")
        if not isinstance(m, dict): continue
        if o.get("type") == "assistant":
            if m.get("usage"): usage[m.get("id") or o["uuid"]] = m["usage"]
            if m.get("model"): models.add(m["model"])
        if isinstance(m.get("content"), list):
            for b in m["content"]:
                if b.get("type") == "tool_use":
                    tools[b["name"]] += 1
                    tool_names_by_id[b["id"]] = b["name"]
                    if b["name"] == "Read":
                        reads[b["input"].get("file_path", "?")] += 1
                elif b.get("type") == "tool_result" and b.get("is_error"):
                    c = b.get("content")
                    c = c if isinstance(c, str) else json.dumps(c)
                    if DENY.search(c):
                        denied.append((tool_names_by_id.get(b.get("tool_use_id"), "?"), c[:120].replace("\n", " ")))
                        continue
                    errors.append((tool_names_by_id.get(b.get("tool_use_id"), "?"), c[:160].replace("\n", " ")))
    tot = collections.Counter()
    for u in usage.values():
        tot["in"] += u.get("input_tokens", 0)
        tot["cache_write"] += u.get("cache_creation_input_tokens", 0)
        tot["cache_read"] += u.get("cache_read_input_tokens", 0)
        tot["out"] += u.get("output_tokens", 0)
    secs = (ts(last) - ts(first)).total_seconds() if first and last else 0
    return dict(denied=denied, turns=len(usage), tok=tot, tools=tools, reads=reads, errors=errors,
                models=sorted(models), start=first, secs=secs)

def main():
    argv = sys.argv[1:]
    pdir = project_dir(argv)
    flagvals = {v for n in ("--project-dir", "--spec", "--plan", "--report") for v in opt(argv, n)}
    ids = [a for a in argv if not a.startswith("--") and a not in flagvals]
    if ids: main_path = os.path.join(pdir, ids[0] + ".jsonl")
    else: main_path = max(glob.glob(os.path.join(pdir, "*.jsonl")), key=os.path.getmtime)
    sid = os.path.basename(main_path)[:-6]
    rows = [("main", "(orchestrator)", analyse(main_path))]
    for p in glob.glob(os.path.join(pdir, sid, "subagents", "agent-*.jsonl")):
        meta = {}
        try: meta = json.load(open(p.replace(".jsonl", ".meta.json")))
        except Exception: pass
        rows.append((meta.get("agentType", "?"), meta.get("description", ""), analyse(p)))
    rows = [rows[0]] + sorted(rows[1:], key=lambda r: r[2]["start"] or "")

    print(f"# Session stats `{sid}`\n")
    print("| # | agent | description | model | start (UTC) | dur | turns | in | cache_w | cache_r | out | tool calls | errors |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    grand = collections.Counter()
    for i, (name, desc, r) in enumerate(rows):
        k = r["tok"]; grand.update(k)
        print(f"| {i} | {name} | {desc[:40]} | {','.join(x.replace('claude-','') for x in r['models'])} | "
              f"{(r['start'] or '')[11:19]} | {int(r['secs'])}s | {r['turns']} | {k['in']} | {k['cache_write']} | "
              f"{k['cache_read']} | {k['out']} | {sum(r['tools'].values())} | {len(r['errors'])} |")
    print(f"\n**Total** in={grand['in']} cache_write={grand['cache_write']} cache_read={grand['cache_read']} "
          f"out={grand['out']}; agents spawned: {len(rows)-1}\n")

    print("## Tool calls per agent")
    for name, desc, r in rows:
        print(f"- {name}: " + ", ".join(f"{n}×{c}" for n, c in r["tools"].most_common()))

    print("\n## Files read more than once inside one agent")
    for name, desc, r in rows:
        for f, c in r["reads"].items():
            if c > 1: print(f"- {name}: `{f}` ×{c}")
    print("\n## Files read by 2+ agents (duplicated discovery)")
    owners = collections.defaultdict(list)
    for name, desc, r in rows:
        for f in r["reads"]: owners[f].append(name)
    for f, o in owners.items():
        if len(o) > 1: print(f"- `{f}`: {', '.join(o)}")

    print("\n## Tool errors")
    for name, desc, r in rows:
        for tool, msg in r["errors"]: print(f"- {name} / {tool}: {msg}")

    # outliers: cost = in + cache_write + out; flag > 2x median of subagents
    costs = {i: r["tok"]["in"] + r["tok"]["cache_write"] + r["tok"]["out"] for i, (_, _, r) in enumerate(rows)}
    subs = [c for i, c in costs.items() if i]
    print("\n## Cost outliers (in + cache_write + out)")
    if len(subs) >= 3:
        med = statistics.median(subs)
        flagged = [(i, c) for i, c in costs.items() if i and c > 2 * med]
        print(f"median subagent = {int(med)}; threshold = 2x")
        for i, c in flagged: print(f"- #{i} {rows[i][0]} ({rows[i][1][:40]}): {c} = {c/med:.1f}x median")
        if not flagged: print("- none")
    else:
        print("- fewer than 3 subagents, no median")

    print("\n## Permission denials / stalls")
    n = 0
    for name, desc, r in rows:
        for tool, msg in r["denied"]:
            n += 1; print(f"- {name} / {tool}: {msg}")
    if not n: print("- none")

    spec, plan, reports = (opt(argv, "--spec") or [None])[0], (opt(argv, "--plan") or [None])[0], opt(argv, "--report")
    if spec:
        ids_of = lambda t: set(re.findall(r"\bAC-\d+\b", t))
        read = lambda f: open(f).read() if f and os.path.exists(f) else ""
        spec_ac = ids_of(read(spec))
        plan_ac = ids_of(read(plan))
        rep_ac = set().union(*[ids_of(read(f)) for f in reports]) if reports else set()
        key = lambda x: int(x[3:])
        print(f"\n## AC coverage (spec {len(spec_ac)} AC)")
        print(f"- not mentioned in plan: {', '.join(sorted(spec_ac - plan_ac, key=key)) or 'none'}" if plan else "- no --plan given")
        print(f"- not mentioned in any verifier/review report: {', '.join(sorted(spec_ac - rep_ac, key=key)) or 'none'}" if reports else "- no --report given")
        print(f"- in plan/report but not in spec (stale?): {', '.join(sorted((plan_ac | rep_ac) - spec_ac, key=key)) or 'none'}")

if __name__ == "__main__":
    main()
