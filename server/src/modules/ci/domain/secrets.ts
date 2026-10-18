/** Module-local secret patterns (the server has no shared set). NFR-4. */
const SECRET_PATTERNS: RegExp[] = [
  /gh[pousr]_[A-Za-z0-9]{36,}/,
  /github_pat_\w{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
];

/** The path of the first file that looks like it holds a secret, or null. Never returns the matched value. */
export function findSecret(files: { path: string; contents: string }[]): string | null {
  for (const f of files) {
    if (SECRET_PATTERNS.some((re) => re.test(f.contents))) return f.path;
  }
  return null;
}
