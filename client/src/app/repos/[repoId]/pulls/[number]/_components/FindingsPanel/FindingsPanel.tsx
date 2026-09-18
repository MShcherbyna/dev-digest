/* FindingsPanel — hide-low-confidence + j/k navigation + FindingCard list,
   wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Toggle, Chip, EmptyState, SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { KEY_TO_ACTION, FILTERABLE_SEVERITIES } from "./constants";
import { visibleFindings, severityCounts } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [hideLow, setHideLow] = React.useState(false);
  const [focusIdx, setFocusIdx] = React.useState(0);

  // The active severity filter is shared by every FindingsPanel on the page
  // (one per review run) via the `severity` URL param, so clicking a chip in
  // one run's panel filters "Review Runs" as a whole — and a PR-list link can
  // deep-link straight into a filtered state. Derived, not stored: no
  // useState to keep in sync with the URL.
  const activeSeverity = search.get("severity");
  const setSeverity = (sev: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (sev == null || sev === activeSeverity) sp.delete("severity");
    else sp.set("severity", sev);
    router.replace(`${pathname}${sp.toString() ? `?${sp.toString()}` : ""}`);
  };

  const counts = severityCounts(findings);
  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, activeSeverity),
    [findings, hideLow, activeSeverity],
  );

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      <div style={s.toolbar}>
        <div style={s.severityChips}>
          {FILTERABLE_SEVERITIES.filter((sev) => (counts[sev] ?? 0) > 0).map((sev) => (
            <Chip
              key={sev}
              icon={SEV[sev].icon}
              color={SEV[sev].c}
              count={counts[sev]}
              active={activeSeverity === sev}
              onClick={() => setSeverity(sev)}
            >
              {SEV[sev].label}
            </Chip>
          ))}
        </div>
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
