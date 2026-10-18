const MAX_SLUG = 60;

/** Kebab-case ASCII: NFKD, strip diacritics, at most 60 chars; `fallback` when nothing is left (AC-32). */
export function slugify(name: string, fallback = 'agent'): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/, '');
  return slug || fallback;
}

/**
 * The agent slug doubles as the workflow job id, which GitHub requires to
 * start with a letter or underscore — prefix a leading digit.
 */
export function agentSlug(name: string): string {
  const slug = slugify(name, 'agent');
  return /^[0-9]/.test(slug) ? `agent-${slug}`.slice(0, MAX_SLUG).replace(/-+$/, '') : slug;
}

/**
 * One slug per skill, in link order. Skills that collide get `-2`, `-3`… on the
 * second and later occurrence (AC-32); the suffix never pushes a slug past 60 chars.
 */
export function assignSkillSlugs(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const base = slugify(name, 'skill');
    let candidate = base;
    for (let n = 2; used.has(candidate); n++) {
      const suffix = `-${n}`;
      candidate = `${base.slice(0, MAX_SLUG - suffix.length).replace(/-+$/, '')}${suffix}`;
    }
    used.add(candidate);
    return candidate;
  });
}
