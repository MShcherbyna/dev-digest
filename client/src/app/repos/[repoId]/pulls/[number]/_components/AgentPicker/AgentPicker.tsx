/* AgentPicker — S1 popover: pick 1-8 enabled agents and run them on this PR.
   1 agent checked still calls the unchanged single-agent `/review` endpoint
   (AC-8); 2+ calls POST /pulls/:id/multi-agent-run and navigates to the
   results page (AC-9). The vendored Dropdown can't host checkboxes, so this
   copies its outside-click pattern and adds an Escape close. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon } from "@devdigest/ui";
import { useAgents } from "@/lib/hooks/agents";
import { useRunReview } from "@/lib/hooks/reviews";
import {
  useAgentEstimates,
  useLastAgentSelection,
  useLatestPrMultiAgentRun,
  useStartMultiAgentRun,
} from "@/lib/hooks/multi-agent";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { defaultSelection, formatCombinedEstimate, formatEstimate, MAX_AGENTS } from "@/lib/multi-agent-estimate";
import { combinedFor, enabledAgents, estimatesFor } from "./helpers";
import { s } from "./styles";

export function AgentPicker({
  prId,
  repoId,
  trigger,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  repoId: string | null;
  trigger: React.ReactNode;
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const { data: agents } = useAgents();
  const available = enabledAgents(agents);
  const availableIds = React.useMemo(() => available.map((a) => a.id), [available]);

  const { data: lastSelection } = useLastAgentSelection(repoId);
  const statsById = useAgentEstimates(availableIds);
  const estimates = estimatesFor(availableIds, statsById);

  const [selected, setSelected] = React.useState<string[]>([]);
  const initialized = React.useRef(false);
  React.useEffect(() => {
    if (initialized.current) return;
    if (availableIds.length === 0 && lastSelection === undefined) return;
    initialized.current = true;
    setSelected(defaultSelection(availableIds, lastSelection?.agent_ids ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableIds.join(","), lastSelection]);

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const runReview = useRunReview();
  const startMulti = useStartMultiAgentRun();
  const { data: latestMulti } = useLatestPrMultiAgentRun(prId);
  const [running, setRunning] = React.useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_AGENTS) return prev;
      return [...prev, id];
    });
  };

  const clear = () => setSelected([]);

  const run = async () => {
    if (selected.length === 0) return;
    onRunStart?.();
    setRunning(true);
    try {
      if (selected.length === 1) {
        const res = await runReview.mutateAsync({ prId, agentId: selected[0] });
        onRunsStarted?.(res.runs.map((r) => r.run_id));
        setOpen(false);
        return;
      }
      try {
        const run = await startMulti.mutateAsync({ prId, agentIds: selected });
        router.push(`/multi-agent-review/${run.id}`);
        setOpen(false);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          toast.error("A multi-agent run is already in progress for this PR.");
          if (latestMulti) router.push(`/multi-agent-review/${latestMulti.id}`);
          setOpen(false);
          return;
        }
        throw e;
      }
    } finally {
      setRunning(false);
      onRunSettled?.();
    }
  };

  const combined = combinedFor(selected, estimates);

  return (
    <div ref={ref} style={s.wrap}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div style={s.popover} role="menu" aria-label={t("picker.heading")}>
          <div style={s.headerRow}>
            <span style={s.heading}>{t("picker.heading")}</span>
            <button type="button" style={s.clearLink} onClick={clear}>
              {t("picker.clear")}
            </button>
          </div>

          {available.length === 0 ? (
            <div style={s.emptyNote}>{t("picker.noAgentsEnabled")}</div>
          ) : (
            available.map((a) => {
              const checked = selected.includes(a.id);
              const atCap = !checked && selected.length >= MAX_AGENTS;
              const est = estimates[a.id];
              const estLabel = est ? formatEstimate(est) : t("picker.noEstimateYet");
              return (
                <div
                  key={a.id}
                  style={s.row(atCap)}
                  title={atCap ? t("picker.maxReached", { max: MAX_AGENTS }) : undefined}
                >
                  <span style={s.checkboxWrap}>
                    <Checkbox
                      checked={checked}
                      onChange={() => !atCap && toggle(a.id)}
                      label={
                        <span style={s.rowLabel}>
                          <Icon.Cpu size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                          <span style={s.rowName}>{a.name}</span>
                          <span style={s.rowEstimate}>{estLabel}</span>
                        </span>
                      }
                    />
                  </span>
                </div>
              );
            })
          )}

          <div style={s.runRow}>
            <Button
              kind="primary"
              size="sm"
              icon="Users"
              full
              disabled={selected.length === 0}
              loading={running}
              onClick={run}
            >
              {t("picker.runMulti", { count: selected.length })}
            </Button>
          </div>
          {selected.length > 0 && <div className="mono" style={s.combined}>{formatCombinedEstimate(combined)}</div>}

          <div style={s.divider} />
          <button type="button" style={s.configureRow} onClick={() => router.push(`/multi-agent-review/configure?pr=${prId}`)}>
            <Icon.Settings size={14} />
            {t("picker.configureAgents")}
          </button>
        </div>
      )}
    </div>
  );
}
