import { z } from 'zod';

/** What the model must return: the translated finding. */
export const TranslationOutput = z.object({
  title: z.string().min(1),
  rationale: z.string().min(1),
  suggestion: z.string().nullable(),
});
export type TranslationOutput = z.infer<typeof TranslationOutput>;

export const TranslateResponse = z.object({
  language: z.enum(['uk', 'ru']),
  model: z.string(),
  finding_id: z.string(),
  title: z.string(),
  rationale: z.string(),
  suggestion: z.string().nullable(),
});
export type TranslateResponse = z.infer<typeof TranslateResponse>;
