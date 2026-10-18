/* MultiAgentLanding — /multi-agent-review (AC-36a, `e-ma` artboard: "Multi-Agent
   · no agents"). Zero enabled agents shows the empty state; one or more
   enabled agents redirects straight to the Configure run screen. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgents } from "@/lib/hooks/agents";
import { s } from "./styles";

export function MultiAgentLanding() {
  const t = useTranslations("runs");
  const router = useRouter();
  const { data: agents, isLoading } = useAgents();
  const hasEnabled = (agents ?? []).some((a) => a.enabled);

  React.useEffect(() => {
    if (!isLoading && hasEnabled) router.replace("/multi-agent-review/configure");
  }, [isLoading, hasEnabled, router]);

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <div style={s.page}>
        {isLoading || hasEnabled ? (
          <Skeleton height={120} />
        ) : (
          <EmptyState
            icon="Users"
            title={t("page.noAgents.title")}
            body={t("page.noAgents.body")}
            cta={t("page.noAgents.cta")}
            onCta={() => router.push("/agents")}
          />
        )}
      </div>
    </AppShell>
  );
}
