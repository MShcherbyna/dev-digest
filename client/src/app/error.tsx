/* Route-level error boundary — catches render errors below the root layout so a
   crashing page shows a recoverable message instead of a blank screen. Kept free
   of AppShell on purpose: if the shell is what threw, it must not throw again here. */
"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState fullScreen title={t("errorPage.title")} body={t("errorPage.body")} onRetry={reset} />;
}
