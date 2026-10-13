import { estimateTokens } from '@devdigest/reviewer-core';
import { EXCLUDED_DIRS, MAX_DOC_BYTES, READ_CONCURRENCY } from './constants.js';
import { chunkDocument } from './domain/chunking.js';
import type { ResolvedGlob } from './glob.js';
import { capAndSort, docTypeOf, isBlank, mapPool, sha256Hex } from './helpers.js';
import { validateDocPath } from './paths.js';
import type { RepoDocsSource } from './ports.js';
import type { IndexBuild, ManifestEntry } from './types.js';

const EXCLUDED = new Set<string>(EXCLUDED_DIRS);

/** Thrown when the build is abandoned (the job timed out). Not a failure of its own. */
export class CancelledError extends Error {
  constructor() {
    super('project context index build cancelled');
    this.name = 'CancelledError';
  }
}

/**
 * Builds one full index (manifest + chunks + hashes) in memory from a clone.
 * No LLM, no network, no file outside the walk result. Returns null when the
 * clone directory is missing/unreadable.
 */
export async function buildIndex(
  deps: { docs: RepoDocsSource; glob: ResolvedGlob },
  input: { clonePath: string; indexedSha: string },
  isCancelled: () => boolean,
): Promise<IndexBuild | null> {
  const { docs, glob } = deps;
  const { clonePath } = input;
  const found = await docs.walk(
    clonePath,
    EXCLUDED,
    // Same accept rule as discovery: glob + a path that can never become a prompt label.
    (p) => glob.regex.test(p) && validateDocPath(p).ok,
  );
  if (!found) return null;

  const { files, truncated, total } = capAndSort(found);
  const built = await mapPool(files, READ_CONCURRENCY, async (f) => {
    if (isCancelled()) throw new CancelledError();
    const base = { path: f.path, type: docTypeOf(f.path), size: f.size };
    const byteTokens = Math.ceil(f.size / 4);
    const plain = { contentHash: null, tooLarge: false, unreadable: false, empty: false };
    const none: ManifestEntry & { chunks: never[] } = {
      ...base,
      ...plain,
      tokens: byteTokens,
      chunks: [],
    };
    if (f.size > MAX_DOC_BYTES) return { ...none, tooLarge: true };

    const raw = await docs.readRaw(clonePath, f.path, MAX_DOC_BYTES);
    if (raw.kind === 'too_large') return { ...none, tooLarge: true };
    if (raw.kind !== 'ok') return { ...none, unreadable: true };

    const contentHash = sha256Hex(raw.bytes);
    let text: string;
    try {
      // Same decoder as `read()`, so a BOM is stripped exactly as on the run path.
      text = new TextDecoder('utf-8', { fatal: true }).decode(raw.bytes);
    } catch {
      return { ...none, contentHash, unreadable: true };
    }
    if (isBlank(text)) {
      return { ...none, contentHash, empty: true, tokens: estimateTokens(text) };
    }
    return {
      ...none,
      contentHash,
      tokens: estimateTokens(text),
      chunks: chunkDocument(text).map((c) => ({
        ordinal: c.ordinal,
        breadcrumb: c.breadcrumb,
        startOffset: c.startOffset,
        endOffset: c.endOffset,
        tokens: c.tokens,
        text: c.text,
        contentHash: sha256Hex(c.text),
      })),
    };
  });

  return {
    indexedSha: input.indexedSha,
    glob: glob.glob,
    truncated,
    total,
    files: built,
  };
}
