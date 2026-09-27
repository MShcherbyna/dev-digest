import { describe, expect, it } from 'vitest';
import { classifyFile } from './classify.js';

describe('classifyFile', () => {
  it.each([
    // precedence cases
    ['__tests__/x.snap', 'boilerplate'],
    ['.claude/skills/security/SKILL.md', 'wiring'],
    ['e2e/README.md', 'tests'],
    // boilerplate
    ['pnpm-lock.yaml', 'boilerplate'],
    ['client/pnpm-lock.yaml', 'boilerplate'],
    ['package-lock.json', 'boilerplate'],
    ['yarn.lock', 'boilerplate'],
    ['Cargo.lock', 'boilerplate'],
    ['dist/index.js', 'boilerplate'],
    ['build/app.js', 'boilerplate'],
    ['src/__snapshots__/a.test.ts.snap', 'boilerplate'],
    ['src/api.generated.ts', 'boilerplate'],
    ['public/vendor.min.js', 'boilerplate'],
    // tests
    ['server/src/x.test.ts', 'tests'],
    ['client/src/A.test.tsx', 'tests'],
    ['server/test/reviews.it.test.ts', 'tests'],
    ['src/a.spec.ts', 'tests'],
    ['server/test/helpers/pg.ts', 'tests'],
    ['src/__tests__/util.ts', 'tests'],
    ['e2e/flows/login.ts', 'tests'],
    ['server/test/fixtures/README.md', 'tests'],
    // wiring
    ['client/src/components/diff-viewer/index.ts', 'wiring'],
    ['server/vitest.config.ts', 'wiring'],
    ['tsconfig.json', 'wiring'],
    ['server/tsconfig.build.json', 'wiring'],
    ['.eslintrc.json', 'wiring'],
    ['.env.example', 'wiring'],
    ['docker-compose.yml', 'wiring'],
    ['.github/workflows/ci.yml', 'wiring'],
    ['.claude/hooks/planner-guard.sh', 'wiring'],
    // docs
    ['README.md', 'docs'],
    ['server/AGENTS.md', 'docs'],
    ['docs/plans/smart-diff_en.md', 'docs'],
    ['docs/diagram.png', 'docs'],
    ['CHANGELOG.md', 'docs'],
    ['LICENSE', 'docs'],
    // core (fallback)
    ['server/src/modules/reviews/service.ts', 'core'],
    ['client/src/app/page.tsx', 'core'],
    ['src/index.tsx', 'core'],
    ['client/dist/a.js', 'core'],
    ['package.json', 'core'],
  ] as const)('classifies %s as %s', (path, expected) => {
    expect(classifyFile(path)).toBe(expected);
  });
});
