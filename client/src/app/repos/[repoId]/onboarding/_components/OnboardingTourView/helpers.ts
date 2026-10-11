import { SECTION_KEYS, type SectionKey } from "./constants";

export { SECTION_KEYS };

export function sectionDomId(key: SectionKey): string {
  return `tour-${key}`;
}

/** Compact "2m ago" / "2h ago" / "3d ago"; the raw string for an unparsable date. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const sec = Math.max(0, Math.round((now - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/** en-US digit grouping: 12450 -> "12,450". */
export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/** Resolves true when the text reached the clipboard; false if unavailable or rejected. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The `code` of an API error, when it carries one. */
export function errorCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err
    ? ((err as { code?: string }).code ?? undefined)
    : undefined;
}

/** The server's short failure reason (`details.cause`), when an API error carries one. */
export function errorCause(err: unknown): string | undefined {
  const details = typeof err === "object" && err !== null ? (err as { details?: unknown }).details : undefined;
  const cause = typeof details === "object" && details !== null ? (details as { cause?: unknown }).cause : undefined;
  return typeof cause === "string" && cause !== "" ? cause : undefined;
}
