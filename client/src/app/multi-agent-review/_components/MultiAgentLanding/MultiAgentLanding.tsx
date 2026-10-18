/* MultiAgentLanding — /multi-agent-review (AC-36). Zero enabled agents
   shows the empty state (`e-ma` artboard: "Multi-Agent · no agents"). One or
   more enabled agents with no multi-run yet goes straight to Configure run
   (nothing to show). Otherwise this lists the workspace's recent
   multi-agent runs, newest first, with a button to start another — so
   leaving a run (e.g. via the sidebar) and coming back doesn't force a new
   Configure run every time. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgents } from "@/lib/hooks/agents";
import { useRecentMultiAgentRuns } from "@/lib/hooks/multi-agent";
import { s } from "./styles";

export function MultiAgentLanding() {
  const t = useTranslations("runs");
  const router = useRouter();
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const hasEnabled = (agents ?? []).some((a) => a.enabled);
  const { data: recent, isLoading: recentLoading } = useRecentMultiAgentRuns();

  const loading = agentsLoading || (hasEnabled && recentLoading);
  const hasRecent = hasEnabled && (recent?.length ?? 0) > 0;

  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const filtered = (recent ?? []).filter(
    (r) =>
      !q ||
      r.pr_title.toLowerCase().includes(q) ||
      String(r.pr_number).includes(q) ||
      r.repo_full_name.toLowerCase().includes(q),
  );

  React.useEffect(() => {
    if (!loading && hasEnabled && recent && recent.length === 0) {
      router.replace("/multi-agent-review/configure");
    }
  }, [loading, hasEnabled, recent, router]);

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <div style={s.page}>
        {loading || (hasEnabled && !hasRecent) ? (
          <Skeleton height={120} />
        ) : !hasEnabled ? (
          <EmptyState
            icon="Users"
            title={t("page.noAgents.title")}
            body={t("page.noAgents.body")}
            cta={t("page.noAgents.cta")}
            onCta={() => router.push("/agents")}
          />
        ) : (
          <>
            <div style={s.headerRow}>
              <span style={s.heading}>{t("page.recent.heading")}</span>
              <Button kind="primary" icon="Users" onClick={() => router.push("/multi-agent-review/configure")}>
                {t("page.recent.newRun")}
              </Button>
            </div>
            <div style={s.searchBox}>
              <Icon.Search size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("page.recent.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
            {filtered.length === 0 ? (
              <div style={s.rowMeta}>{t("page.recent.noMatches")}</div>
            ) : (
              <div style={s.list}>
                {filtered.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    style={s.row}
                    onClick={() => router.push(`/multi-agent-review/${r.id}`)}
                  >
                    <div style={s.rowLeft}>
                      <span style={s.rowTitle}>
                        {t("page.recent.item", { number: r.pr_number, title: r.pr_title })}
                      </span>
                      <span style={s.rowMeta}>
                        {r.repo_full_name} · {new Date(r.ran_at).toLocaleString()}
                      </span>
                    </div>
                    <div style={s.rowRight}>
                      {r.cancelled && <Badge color="var(--text-muted)">{t("page.recent.cancelledBadge")}</Badge>}
                      <span style={s.rowMeta}>{t("page.recent.agentCount", { count: r.agent_count })}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
