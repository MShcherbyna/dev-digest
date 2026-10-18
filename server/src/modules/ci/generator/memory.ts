import type { MemoryExportItem } from '../ports.js';

/** AC-7: one `{kind, scope, content}` object per line; no ids, embeddings or sources. Empty list -> empty file. */
export function renderMemory(items: MemoryExportItem[]): string {
  if (items.length === 0) return '';
  return items.map((i) => JSON.stringify({ kind: i.kind, scope: i.scope, content: i.content })).join('\n') + '\n';
}
