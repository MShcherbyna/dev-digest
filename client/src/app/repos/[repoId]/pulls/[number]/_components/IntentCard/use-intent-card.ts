"use client";

import { useEffect, useRef } from "react";
import { ApiError } from "@/lib/api";
import { useIsDerivingIntent, useDeriveIntent, usePrIntent } from "@/lib/hooks/intent";
import { cardState, type IntentCardState } from "./helpers";

/**
 * Owns the IntentCard's data flow: read the stored intent, derive it ONCE
 * automatically when none exists yet, and expose the button action.
 *
 * The auto POST (`ifAbsent`) is guarded three ways: `attemptedRef` (once per
 * mount, survives the StrictMode double effect), `useIsMutating` (another card
 * instance already posting) and — server side — idempotency + an in-flight
 * dedupe. A failed attempt is NOT retried automatically (no cost loop); the
 * user retries through the button.
 */
export function useIntentCard(prId: string | null | undefined) {
  const query = usePrIntent(prId);
  const derive = useDeriveIntent(prId);
  const inFlight = useIsDerivingIntent(prId);
  const attemptedRef = useRef<string | null>(null);

  const intent = query.data?.intent ?? null;
  const loaded = query.isSuccess;

  useEffect(() => {
    if (!prId || !loaded || intent !== null) return;
    if (attemptedRef.current === prId || inFlight > 0) return;
    attemptedRef.current = prId;
    derive.mutate("ifAbsent");
    // `derive` is a fresh object each render; the ref guard makes the call idempotent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prId, loaded, intent, inFlight]);

  const state: IntentCardState = cardState({
    loading: !!prId && query.isPending,
    generating: derive.isPending || inFlight > 0,
    intent,
    failed: query.isError || derive.isError,
  });

  const failure = derive.error ?? query.error;
  const failed = query.isError || derive.isError;
  const error = failed ? (failure instanceof ApiError ? failure.message : "") : null;

  return {
    state,
    intent,
    /** Button action: first derivation when none exists, otherwise a regenerate. */
    regenerate: () => derive.mutate(intent ? "regenerate" : "ifAbsent"),
    isGenerating: state === "generating",
    /** null = no failure; "" = failed without a safe message to show. */
    error,
  };
}
