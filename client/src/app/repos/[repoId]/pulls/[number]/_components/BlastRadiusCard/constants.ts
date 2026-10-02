/** How many symbol groups start expanded (3.png: only the first). */
export const DEFAULT_EXPANDED_GROUPS = 1;

/** Kinds that render with a trailing "()" like a call (3.png: `rateLimit()`). */
export const CALLABLE_KINDS: ReadonlySet<string> = new Set(["function", "method"]);

/** Degraded reasons a resync can fix (flag off / too large / no files cannot be helped by re-indexing). */
export const RESYNCABLE_REASONS: ReadonlySet<string> = new Set(["no_data", "index_failed", "index_partial"]);
