import { describe, it, expect } from 'vitest';
import { agentSlug, assignSkillSlugs, slugify } from './slug.js';

describe('slugify', () => {
  it.each([
    ['Security Reviewer', 'security-reviewer'],
    ['  Café  Déjà Vu!! ', 'cafe-deja-vu'],
    ['Ünïcödé___name', 'unicode-name'],
    ['日本語', 'agent'],
    ['', 'agent'],
    ['---', 'agent'],
  ])('%j -> %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('caps at 60 chars without a trailing dash', () => {
    const slug = slugify(`${'a'.repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('uses the given fallback', () => {
    expect(slugify('!!!', 'skill')).toBe('skill');
  });
});

describe('agentSlug', () => {
  it('prefixes a leading digit (a workflow job id cannot start with one)', () => {
    expect(agentSlug('2fast reviewer')).toBe('agent-2fast-reviewer');
    expect(agentSlug('Fast reviewer')).toBe('fast-reviewer');
  });
});

describe('assignSkillSlugs', () => {
  it('suffixes the second and later colliding skills in link order (AC-32)', () => {
    expect(assignSkillSlugs(['Naming', 'Naming!', 'Other', 'naming'])).toEqual([
      'naming',
      'naming-2',
      'other',
      'naming-3',
    ]);
  });

  it('never collides with an already suffixed slug', () => {
    const slugs = assignSkillSlugs(['a', 'a-2', 'a']);
    expect(new Set(slugs).size).toBe(3);
  });

  it('keeps suffixed slugs within 60 chars', () => {
    const long = 'x'.repeat(80);
    const slugs = assignSkillSlugs([long, long]);
    expect(slugs.every((s) => s.length <= 60)).toBe(true);
    expect(slugs[0]).not.toBe(slugs[1]);
  });
});
