/**
 * Pure helpers for the translation module (no DB / network / `this`).
 */
import { createHash } from 'node:crypto';
import type {
  SourceFinding,
  TranslatedItem,
  TranslationLanguage,
  TranslationModelChoice,
  TranslationRecord,
} from './ports.js';

/** Hash of the text that gets translated; a changed finding invalidates its cached translation. */
export function sourceHash(f: Pick<SourceFinding, 'title' | 'rationale' | 'suggestion'>): string {
  return createHash('sha256')
    .update(JSON.stringify([f.title, f.rationale, f.suggestion ?? null]))
    .digest('hex');
}

/** A stored translation is reusable only for the same language, model and source text. */
export function isReusable(
  stored: TranslationRecord | undefined,
  source: SourceFinding,
  language: TranslationLanguage,
  choice: TranslationModelChoice | undefined,
): stored is TranslationRecord {
  return (
    !!stored &&
    !!choice &&
    stored.language === language &&
    stored.provider === choice.provider &&
    stored.model === choice.model &&
    stored.sourceHash === sourceHash(source)
  );
}

export function toItem(r: Pick<TranslationRecord, 'findingId' | 'title' | 'rationale' | 'suggestion'>): TranslatedItem {
  return { findingId: r.findingId, title: r.title, rationale: r.rationale, suggestion: r.suggestion };
}
