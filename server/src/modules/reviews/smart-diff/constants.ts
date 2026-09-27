import type { SmartDiffRole } from '@devdigest/shared';

/** Display order of Smart Diff groups (core → tests → wiring → docs → boilerplate). */
export const ROLE_ORDER: readonly SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

/**
 * Matching order for `classifyFile`: first match wins, `core` is the fallback.
 * Deliberately NOT the same as `ROLE_ORDER` (the display order) — e.g. a
 * snapshot file under `__tests__/` must classify as boilerplate, not tests,
 * so boilerplate is checked first even though tests displays first.
 */
export const CLASSIFY_PRECEDENCE = ['boilerplate', 'tests', 'wiring', 'docs'] as const;

// ---- boilerplate ----
export const BOILERPLATE_BASENAMES = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'] as const;
export const BOILERPLATE_SUFFIXES = ['.lock', '.snap', '.min.js'] as const;
export const BOILERPLATE_INFIXES = ['.generated.'] as const;
export const BOILERPLATE_ROOT_DIRS = ['dist', 'build'] as const;
export const BOILERPLATE_ANY_DIRS = ['__snapshots__'] as const;

// ---- tests ----
export const TEST_SUFFIXES = ['.test.ts', '.test.tsx', '.spec.ts'] as const;
export const TEST_ANY_DIRS = ['test', 'tests', '__tests__'] as const;
export const TEST_ROOT_DIRS = ['e2e'] as const;

// ---- wiring ----
export const WIRING_BASENAMES = ['index.ts', 'index.js'] as const;
export const WIRING_INFIXES = ['.config.'] as const;
export const WIRING_PREFIXES = ['.eslintrc', '.env'] as const;
export const WIRING_TSCONFIG_PREFIX = 'tsconfig';
export const WIRING_TSCONFIG_SUFFIX = '.json';
export const WIRING_DOCKER_COMPOSE_PREFIX = 'docker-compose';
export const WIRING_DOCKER_COMPOSE_SUFFIX = '.yml';
export const WIRING_ROOT_DIRS = ['.github', '.claude'] as const;

// ---- docs ----
export const DOCS_SUFFIXES = ['.md'] as const;
export const DOCS_ROOT_DIRS = ['docs'] as const;
export const DOCS_PREFIXES = ['README', 'CHANGELOG'] as const;
export const DOCS_BASENAMES = ['LICENSE'] as const;
