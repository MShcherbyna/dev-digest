/** Fixed repository paths and limits of Export to CI. Paths are never user-supplied. */

export const CI_BRANCH = 'devdigest/ci';

export const DEVDIGEST_DIR = '.devdigest';
export const WORKFLOW_FILE = 'devdigest-review.yml';
export const WORKFLOW_PATH = `.github/workflows/${WORKFLOW_FILE}`;
export const MEMORY_PATH = `${DEVDIGEST_DIR}/memory.jsonl`;
export const RUNNER_PATH = `${DEVDIGEST_DIR}/runner/index.js`;

export const agentManifestPath = (slug: string) => `${DEVDIGEST_DIR}/agents/${slug}.yaml`;
export const skillPath = (slug: string) => `${DEVDIGEST_DIR}/skills/${slug}.md`;
export const resultArtifactName = (slug: string) => `devdigest-result-${slug}`;

/** The repository Actions secret whose existence (never value) Preview reports. */
export const OPENROUTER_SECRET = 'OPENROUTER_API_KEY';
export const GITHUB_TOKEN_SECRET = 'GITHUB_TOKEN';

export const PR_TITLE_ADD = 'Add DevDigest CI review';
export const PR_TITLE_UPDATE = 'Update DevDigest CI review';
export const PR_TITLE_REMOVE = 'Remove DevDigest CI review';

/** Largest exported file and largest accepted result artifact (AC-23, E-15). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ARTIFACT_BYTES = 5 * 1024 * 1024;

/** The export body carries the (possibly edited) workflow only, but keep headroom above the 5 MB file cap. */
export const CI_EXPORT_BODY_LIMIT_BYTES = 6 * 1024 * 1024;

/** NFR-3: preview, export, remove and refresh each allow 10 requests per minute. */
export const CI_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;

/** NFR-2 / AC-21: ingest looks back at most 30 days and fetches at most 50 runs per installation. */
export const INGEST_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
export const INGEST_MAX_RUNS = 50;

/** Only links under this prefix are stored and rendered as job links. */
export const JOB_URL_PREFIX = 'https://github.com/';

export const NO_RESULT_ERROR = 'CI run produced no result';
