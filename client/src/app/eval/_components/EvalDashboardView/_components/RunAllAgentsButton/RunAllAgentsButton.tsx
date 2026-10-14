/* RunAllAgentsButton — starts an eval run for every eligible agent. `running` comes from server data
   (any agent has a running run), so the disabled state survives a page reload. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { notify } from "@/lib/toast";
import { useRunAllAgents } from "@/lib/hooks/eval";

export function RunAllAgentsButton({ running }: { running: boolean }) {
  const t = useTranslations("eval.allAgents");
  const runAll = useRunAllAgents();

  const onClick = () =>
    runAll.mutate(undefined, {
      onSuccess: ({ started, skipped }) =>
        notify.success(
          started.length > 0
            ? t("startedToast", { started: started.length, skipped: skipped.length })
            : t("nothingToast", { skipped: skipped.length }),
        ),
      onError: () => notify.error(t("runAllFailed")),
    });

  return (
    <Button kind="primary" icon="Play" onClick={onClick} disabled={running} loading={runAll.isPending}>
      {running ? t("runningAll") : t("runAll")}
    </Button>
  );
}
