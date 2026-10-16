import { describe, it, expect } from 'vitest';
import { buildTaskLine } from '../src/task.js';

describe('buildTaskLine', () => {
  it('includes number and author when given', () => {
    const line = buildTaskLine({ title: 'Fix bug', number: 12, author: 'alice' });
    expect(line.startsWith('Review pull request #12 "Fix bug" by alice. Report only the distinct')).toBe(true);
  });

  it('omits number and author when absent, keeping the rest identical', () => {
    const full = buildTaskLine({ title: 'T', number: 1, author: 'a' });
    const bare = buildTaskLine({ title: 'T' });
    expect(bare.startsWith('Review pull request "T". Report only')).toBe(true);
    expect(bare.slice(bare.indexOf('Report only'))).toBe(full.slice(full.indexOf('Report only')));
  });
});
