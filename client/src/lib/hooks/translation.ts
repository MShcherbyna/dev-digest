/* hooks/translation.ts — React Query hook for finding translation.
   POST /findings/:id/translate translates ONE finding with the workspace's
   `translation` feature model + `translation_language` (cached server-side; a repeat
   call with the same model/language is served from the DB). The response shape is
   module-local on the server (not in @devdigest/shared), mirrored here. */
"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "../api";

export interface TranslatedFinding {
  language: "uk" | "ru";
  model: string;
  finding_id: string;
  title: string;
  rationale: string;
  suggestion: string | null;
}

export function useTranslateFinding(findingId: string) {
  return useMutation({
    mutationFn: () => api.post<TranslatedFinding>(`/findings/${findingId}/translate`),
  });
}
