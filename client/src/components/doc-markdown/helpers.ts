/** Only absolute http(s) URLs are linkable; everything else (javascript:, data:, mailto:, relative) is dropped. */
export function isSafeHref(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}
