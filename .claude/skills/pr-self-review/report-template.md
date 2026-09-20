# Report formats

## Finding (JSON, one array per producer)

```json
[
  {
    "severity": "critical | major | minor",
    "skill": "onion-architecture",
    "rule": "onion/raw-rows",
    "file": "server/src/modules/repos/repository.ts",
    "line": 42,
    "message": "listRepos returns $inferSelect rows (`return db.select().from(t.repos)`).",
    "suggestion": "Map rows to the shared Repo type before returning.",
    "basis": "onion-architecture: Drizzle rule (repository returns domain types)",
    "source": "review | deterministic"
  }
]
```

`basis` is required when `severity` is `critical` on a review finding (cite the skill section/tag or severity.md row); without it `finalize.py` downgrades the finding to `major`.

`file` is repo-relative and must exist at `HEAD`; `line` must be within the file (`0` only for whole-file
or whole-repo findings such as `det/vendor-drift`). `finalize.py` drops findings that fail this.

## `.claude/pr-self-review/last-report.json` (written by `finalize.py`)

```json
{
  "timestamp": "2026-09-20T12:00:00Z",
  "base_sha": "…", "head_sha": "…",
  "verdict": "PASS | BLOCKED",
  "critical_count": 0,
  "counts": { "critical": 0, "major": 0, "minor": 0, "waived": 0, "dropped": 0 },
  "tests_skipped": false,
  "dirty_worktree": false,
  "findings": [ /* finding + "waived": true|false + "skills": [...] after dedupe */ ],
  "warnings": []
}
```

## Human report

```
PR Self Review — <branch> vs main  (<N> files, <packages>)
Verdict: BLOCKED | PASS

Critical (n)
- <file>:<line>  [<rule>] <message>  → <suggestion>
Major (n)  …
Minor (n)  …
Waived (n) …
Warnings: <dirty worktree / skipped tests / skills without routing / dropped findings>

Skills run: <skill → files count>
```

If BLOCKED end with: "Do not open the PR until the critical findings are fixed or waived with a reason."
