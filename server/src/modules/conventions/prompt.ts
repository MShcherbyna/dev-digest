import type { ChatMessage } from '@devdigest/shared';

const SYSTEM = `You extract coding conventions from a repository.
You are given configuration files and the most important source files. Every line is prefixed with "<line number>: ".

Find house conventions that are visibly followed in the code (naming, file layout, framework patterns, typing, error handling, style).
For each one return:
- rule: one short imperative sentence, e.g. "Always use TypeORM entity decorators to define database models"
- evidence.file: the exact path as given in the "=== FILE:" header
- evidence.line: the line number where the convention is visible
- evidence.code: the exact code text of that line, copied verbatim (without the line-number prefix)
- confidence: 0..1, how consistently the repository follows it
- category: optional short label

Rules: only report conventions you can point to in the provided files; never invent files or lines; prefer conventions shown in several files; return at most 30.`;

export function buildExtractionMessages(files: Array<{ path: string; content: string }>): ChatMessage[] {
  const body = files.map((f) => `=== FILE: ${f.path} ===\n${f.content}`).join('\n\n');
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: body },
  ];
}
