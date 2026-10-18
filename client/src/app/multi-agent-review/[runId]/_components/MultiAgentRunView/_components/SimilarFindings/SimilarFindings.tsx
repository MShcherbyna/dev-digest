/* SimilarFindings — other agents' findings in the same group (AC-22), shown
   under a FindingCard in the Tabs view. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge, type Severity } from "@devdigest/ui";
import type { AgentColumnFindingView } from "@/lib/types";

export function SimilarFindings({
  members,
}: {
  members: { agentName: string; finding: AgentColumnFindingView }[];
}) {
  const t = useTranslations("runs");
  if (members.length === 0) return null;
  return (
    <div
      style={{
        marginTop: 8,
        marginBottom: 4,
        padding: "8px 10px",
        borderRadius: 7,
        background: "var(--bg-hover)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.03em" }}>
        {t("tabs.similarFindings")}
      </div>
      {members.map(({ agentName, finding }) => (
        <div key={finding.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
          <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{agentName}</span>
          <SeverityBadge severity={finding.severity as Severity} compact />
          <span style={{ color: "var(--text-muted)" }}>{finding.title}</span>
        </div>
      ))}
    </div>
  );
}
