/** Tunables of the onboarding module. Pure data: no imports. */

// List caps (spec AC-9) and the ranges the prompt asks for.
export const MAX_CRITICAL_PATHS = 6;
export const MAX_READING_PATH = 8;
export const MAX_FIRST_TASKS = 3;
export const MAX_RUN_COMMANDS = 8;

// Diagram caps (more than this makes the graph invalid -> diagram: null).
export const DIAGRAM_MAX_NODES = 12;
export const DIAGRAM_MAX_EDGES = 24;
export const NODE_KINDS: readonly string[] = ['entry', 'service', 'middleware', 'storage', 'external'];

// Prompt budget.
export const TOP_FILES = 40;
export const MAX_CHAINS = 5;
export const SHALLOW_TREE_DEPTH = 2;
export const SHALLOW_TREE_MAX = 150;
export const README_MAX_CHARS = 6000;
export const OUTPUT_MAX_TOKENS = 6000;
export const MAX_FACT_FILE_BYTES = 256 * 1024;
export const MAX_PACKAGE_JSONS = 20;
export const MAX_COMPOSE_FILES = 5;

export const MAX_REL_PATH_CHARS = 1024;

// Fact files. README / env-example are matched at the clone root only.
export const README_NAMES: ReadonlySet<string> = new Set(['README.md', 'README', 'readme.md', 'Readme.md']);
export const ENV_EXAMPLE_NAMES: ReadonlySet<string> = new Set(['.env.example', '.env.sample']);
export const COMPOSE_NAMES: ReadonlySet<string> = new Set([
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
]);
export const PACKAGE_JSON = 'package.json';

export const EXCLUDED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  'vendor',
  '.turbo',
  '.cache',
]);

const PNPM_LIKE_BUILTINS = [
  'install', 'i', 'add', 'remove', 'rm', 'update', 'up', 'upgrade', 'exec', 'dlx', 'x', 'create',
  'init', 'import', 'link', 'unlink', 'prune', 'store', 'why', 'list', 'ls', 'outdated', 'audit',
  'publish', 'pack', 'rebuild', 'setup', 'env', 'config', 'patch', 'fetch', 'install-test', 'licenses',
];

/** Package-manager sub-commands that are NOT script references. */
export const PM_BUILTINS: Readonly<Record<'pnpm' | 'yarn' | 'bun' | 'npm', ReadonlySet<string>>> = {
  pnpm: new Set(PNPM_LIKE_BUILTINS),
  yarn: new Set(PNPM_LIKE_BUILTINS),
  bun: new Set(PNPM_LIKE_BUILTINS),
  npm: new Set([
    'install', 'i', 'ci', 'add', 'uninstall', 'update', 'exec', 'init', 'link', 'ls', 'audit',
    'outdated', 'publish', 'pack', 'rebuild', 'prune', 'config', 'cache', 'version', 'view', 'doctor',
  ]),
};

/** `npm <alias>` resolves to a script of the same name. */
export const NPM_SCRIPT_ALIASES: ReadonlySet<string> = new Set(['start', 'test', 'stop', 'restart']);

/** Flags that consume the next token, per tool family. */
export const PM_VALUE_FLAGS: ReadonlySet<string> = new Set(['-C', '--dir', '--filter', '-F', '--prefix', '--cwd']);
/** Compose flags before the sub-command that consume a value. */
export const COMPOSE_GLOBAL_VALUE_FLAGS: ReadonlySet<string> = new Set([
  '-f', '--file', '-p', '--project-name', '--profile', '--env-file',
]);
/** Sub-command flags that consume a value (`-f` there means --follow, not --file). */
export const COMPOSE_SUB_VALUE_FLAGS: ReadonlySet<string> = new Set([
  '-e', '-u', '-w', '--tail', '-n', '-t', '--timeout', '--scale', '--wait-timeout', '--since', '--until',
]);
export const COMPOSE_SERVICE_SUBCOMMANDS: ReadonlySet<string> = new Set([
  'up', 'start', 'run', 'restart', 'stop', 'logs', 'build', 'exec', 'pull', 'create', 'rm', 'down',
]);

export const TOUR_SCHEMA_NAME = 'OnboardingTour';
export const DEFAULT_TIMEOUT_MS = 120_000;
export const LOG_CAUSE_MAX_CHARS = 300;
