import { SLUG_MAX } from '../constants.js';

const FALLBACK = 'case';

/**
 * Kebab-case ASCII slug of a title, at most `SLUG_MAX` chars (cut at a dash
 * boundary when possible). Falls back to `case` when nothing usable remains.
 */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length === 0) return FALLBACK;
  if (slug.length <= SLUG_MAX) return slug;
  const cut = slug.slice(0, SLUG_MAX);
  // Prefer a whole-word cut when the next char starts a new word.
  const boundary = slug[SLUG_MAX] === '-' ? SLUG_MAX : cut.lastIndexOf('-');
  const out = (boundary > 0 ? slug.slice(0, boundary) : cut).replace(/-+$/g, '');
  return out.length > 0 ? out : FALLBACK;
}
