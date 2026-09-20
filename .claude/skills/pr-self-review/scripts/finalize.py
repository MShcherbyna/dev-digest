#!/usr/bin/env python3
"""Merge findings, ground them, apply waivers, compute the verdict, write last-report.json.

Usage: finalize.py --base <sha> [--det det.json] [--review r1.json ...] [--tests-skipped]
"""
import argparse, html, json, os, re, subprocess, sys
from datetime import datetime, timezone

RANK = {"critical": 3, "major": 2, "minor": 1}


def git(*args):
    r = subprocess.run(["git", *args], capture_output=True, text=True)
    return r.returncode, r.stdout


def load(paths):
    out = []
    for p in paths:
        try:
            data = json.load(open(p))
        except (OSError, ValueError) as e:
            print(f"warning: cannot read {p}: {e}", file=sys.stderr)
            continue
        for f in data if isinstance(data, list) else []:
            # subagent output is sometimes HTML-escaped (`=&gt;`); restore code text
            out.append({k: html.unescape(v) if isinstance(v, str) else v for k, v in f.items()})
    return out


def unrouted_skills():
    """Skills listed in .claude/skills/README.md that routing.md never mentions."""
    try:
        catalog = open(".claude/skills/README.md").read()
        routing = open(".claude/skills/pr-self-review/routing.md").read()
    except OSError:
        return []
    names = re.findall(r"^\| \[([a-z0-9-]+)\]\(", catalog, re.M)
    return [n for n in names if n not in routing]


def grounded(f):
    """file exists at HEAD and line is within it (line 0 = whole-file/repo finding)."""
    if f.get("severity") not in RANK or not f.get("rule") or not f.get("message"):
        return False
    path = f.get("file") or ""
    if not path:
        return f.get("line", 0) == 0
    rc, content = git("show", f"HEAD:{path}")
    if rc != 0:  # deterministic findings may point at a package path that only exists on disk
        return f.get("source") == "deterministic" and os.path.exists(path)
    line = f.get("line", 0)
    return isinstance(line, int) and 0 <= line <= content.count("\n") + 1


def waived(f, waivers, today):
    for w in waivers:
        if w.get("rule") != f["rule"] or w.get("file") not in (f["file"], "*"):
            continue
        if not w.get("reason") or not w.get("author"):
            continue
        exp = w.get("expires")
        if exp and exp < today:
            continue
        return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--det", nargs="*", default=[])
    ap.add_argument("--review", nargs="*", default=[])
    ap.add_argument("--tests-skipped", action="store_true")
    a = ap.parse_args()

    root = git("rev-parse", "--show-toplevel")[1].strip()
    os.chdir(root)
    head = git("rev-parse", "HEAD")[1].strip()
    warnings = []

    raw = load(a.det) + load(a.review)
    findings, dropped = [], 0
    for f in raw:
        f.setdefault("file", "")
        f.setdefault("line", 0)
        f.setdefault("source", "review")
        if grounded(f):
            findings.append(f)
        else:
            dropped += 1
    if dropped:
        warnings.append(f"{dropped} ungrounded finding(s) dropped (file/line not found at HEAD)")

    unbased = 0
    for f in findings:
        if f["source"] == "review" and f["severity"] == "critical" and not f.get("basis"):
            f["severity"] = "major"
            unbased += 1
    if unbased:
        warnings.append(f"{unbased} critical review finding(s) had no `basis` and were downgraded to major")

    # dedupe on (file, line, rule): keep max severity, union skills
    merged = {}
    for f in findings:
        k = (f["file"], f["line"], f["rule"])
        if k not in merged:
            f["skills"] = [f.get("skill", "")]
            merged[k] = f
        else:
            m = merged[k]
            if f.get("skill") and f["skill"] not in m["skills"]:
                m["skills"].append(f["skill"])
            if RANK[f["severity"]] > RANK[m["severity"]]:
                m["severity"] = f["severity"]
    findings = list(merged.values())

    wpath = ".claude/pr-self-review/waivers.json"
    waivers = []
    if os.path.exists(wpath):
        try:
            waivers = json.load(open(wpath))
        except ValueError:
            warnings.append("waivers.json is not valid JSON; no waivers applied")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for f in findings:
        f["waived"] = waived(f, waivers, today)

    findings.sort(key=lambda f: (-RANK[f["severity"]], f["file"], f["line"]))
    counts = {s: sum(1 for f in findings if f["severity"] == s and not f["waived"]) for s in RANK}
    counts["waived"] = sum(1 for f in findings if f["waived"])
    counts["dropped"] = dropped

    for name in unrouted_skills():
        warnings.append(f"skill {name} has no entry in routing.md")

    if git("status", "--porcelain")[1].strip():
        warnings.append("working tree is dirty: the report does not cover uncommitted changes")
    if a.tests_skipped:
        warnings.append("tests were skipped (--skip-tests)")

    report = {
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "base_sha": a.base,
        "head_sha": head,
        "verdict": "BLOCKED" if counts["critical"] else "PASS",
        "critical_count": counts["critical"],
        "counts": counts,
        "tests_skipped": a.tests_skipped,
        "dirty_worktree": any("dirty" in w for w in warnings),
        "findings": findings,
        "warnings": warnings,
    }
    os.makedirs(".claude/pr-self-review", exist_ok=True)
    with open(".claude/pr-self-review/last-report.json", "w") as fh:
        json.dump(report, fh, indent=2)
    print(json.dumps({k: report[k] for k in ("verdict", "critical_count", "counts", "warnings")}, indent=2))
    sys.exit(0)


if __name__ == "__main__":
    main()
