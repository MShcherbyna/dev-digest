/* CompareModal — two runs side by side: metric tiles, system prompt diff, Promote (screenshot 5).
   Opened only after a successful compare fetch, so it always has a full payload. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { AccessibleModal } from "@/components/accessible-modal";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/toast";
import { usePromoteAgent, type CompareResponse } from "@/lib/hooks/eval";
import { CompareTiles } from "./_components/CompareTiles";
import { PromoteConfirm } from "./_components/PromoteConfirm";
import { PromptDiff } from "./_components/PromptDiff";
import { promoteCandidates } from "./helpers";
import { s } from "./styles";

export function CompareModal({
  agentId,
  compare,
  onClose,
  returnFocusTo,
}: {
  agentId: string;
  compare: CompareResponse;
  onClose: () => void;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("eval.compare");
  const promote = usePromoteAgent(agentId);
  const [confirming, setConfirming] = React.useState<number | null>(null);
  const candidates = promoteCandidates(compare);

  const onConfirm = (version: number) =>
    promote.mutate(
      { version },
      {
        onSuccess: (res) => {
          notify.success(t("promoted", { version, newVersion: res.version }));
          onClose();
        },
        onError: (e) => {
          const code = e instanceof ApiError ? e.code : undefined;
          notify.error(code && t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"));
          setConfirming(null);
        },
      },
    );

  const footer =
    confirming != null ? (
      <PromoteConfirm
        version={confirming}
        pending={promote.isPending}
        onConfirm={() => onConfirm(confirming)}
        onCancel={() => setConfirming(null)}
      />
    ) : (
      <div style={s.footer}>
        <Button onClick={onClose}>{t("close")}</Button>
        {candidates.length === 0 ? (
          <>
            <Button kind="primary" icon="GitBranch" disabled aria-describedby="promote-hint">
              {t("promote", { version: compare.b.agent_version })}
            </Button>
            <span id="promote-hint" style={s.hint}>
              {t("alreadyCurrent", { version: compare.b.agent_version })}
            </span>
          </>
        ) : (
          candidates.map((c) => (
            <Button key={c.version} kind="primary" icon="GitBranch" onClick={() => setConfirming(c.version)}>
              {t("promote", { version: c.version })}
            </Button>
          ))
        )}
      </div>
    );

  return (
    <AccessibleModal
      width={900}
      title={t("title", { a: compare.a.agent_version, b: compare.b.agent_version })}
      subtitle={t("subtitle", { cases: compare.cases_total })}
      footer={footer}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
    >
      <div style={s.body}>
        <CompareTiles compare={compare} />
        <PromptDiff
          promptA={compare.prompt_a}
          promptB={compare.prompt_b}
          versionA={compare.a.agent_version}
          versionB={compare.b.agent_version}
        />
      </div>
    </AccessibleModal>
  );
}
