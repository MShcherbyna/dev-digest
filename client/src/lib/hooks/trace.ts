/* hooks/trace.ts — A5 Run Trace. GET /runs/:id/trace returns the ENTIRE
   trace of one run as a single document (config + stats + prompt_assembly +
   tool_calls[] + raw_output + memory_pulled[] + full log). Registered by A2;
   A5 enriches the document it returns. Live events stream via useRunEvents
   (hooks/reviews.ts) — the drawer combines both. */
"use client";

import { queryKeys } from "./keys";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { RunTraceView } from "../types";

export function useRunTrace(runId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.runTrace(runId),
    queryFn: () => api.get<RunTraceView>(`/runs/${runId}/trace`),
    enabled: !!runId && enabled,
    // The trace row can lag the run's `done`/`failed` status by a beat
    // (R7/trace-before-status closes most of this, but not all of it) — retry
    // once, after ~1s, ONLY on a 404 ("trace not ready yet"). Any other error
    // fails immediately.
    retry: (failureCount, error) =>
      failureCount < 1 && error instanceof ApiError && error.status === 404,
    retryDelay: 1000,
  });
}
