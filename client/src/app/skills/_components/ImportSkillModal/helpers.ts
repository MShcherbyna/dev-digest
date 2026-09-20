/** True for `*.md` filenames (case-insensitive). */
export function isMarkdownFile(filename: string): boolean {
  return /\.md$/i.test(filename);
}
