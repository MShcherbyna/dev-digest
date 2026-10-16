/* EvalCaseModal — create/edit one eval case (screenshot 7): name, input (Diff / Files / PR meta),
   expected-output JSON, last-run result, and Run-on-save / Cancel / Run case / Save. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Agent } from "@devdigest/shared";
import { Button, FormField, Tabs, TextInput, Toggle } from "@devdigest/ui";
import { AccessibleModal } from "@/components/accessible-modal";
import { ApiError } from "@/lib/api";
import {
  useCreateCaseFromFinding,
  useCreateEvalCase,
  useEvalCase,
  useRunEvalCase,
  useUpdateEvalCase,
  type EvalCase,
  type EvalCaseBody,
} from "@/lib/hooks/eval";
import { EMPTY_EXPECTED, NAME_MAX, type InputTab } from "./constants";
import { parseExpected } from "./expected-output";
import { addSkeleton, parseDiffFiles, serverReason, validateCaseForm, type ServerReason } from "./helpers";
import { DiffInput } from "./_components/DiffInput";
import { ExpectedOutputEditor } from "./_components/ExpectedOutputEditor";
import { FilesList } from "./_components/FilesList";
import { PrMetaInput } from "./_components/PrMetaInput";
import { RunResultPanel } from "./_components/RunResultPanel";
import { s } from "./styles";

/** `caseId` null = new case. `findingId` (+ `prId` and a pre-loaded `draft`) previews/creates a case
 *  from a decided finding instead: the diff and PR meta come read-only from the finding. */
export function EvalCaseModal({
  agent,
  caseId,
  draft,
  findingId,
  prId,
  onSaved,
  onClose,
}: {
  agent: Agent;
  caseId: string | null;
  draft?: EvalCaseBody | null;
  findingId?: string;
  prId?: string;
  /** Called right after the case is persisted (including a 409 "already exists" race), before onClose. */
  onSaved?: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("eval.caseEditor");
  const loaded = useEvalCase(caseId);
  if (caseId && !loaded.data) {
    return (
      <AccessibleModal width={1100} title={t("newCase")} onClose={onClose}>
        <div style={s.loading}>{t("loadingCase")}</div>
      </AccessibleModal>
    );
  }
  return (
    <CaseForm
      agent={agent}
      initial={loaded.data ?? null}
      draft={draft ?? null}
      findingId={findingId}
      prId={prId}
      onSaved={onSaved}
      onClose={onClose}
    />
  );
}

function CaseForm({
  agent,
  initial,
  draft,
  findingId,
  prId,
  onSaved,
  onClose,
}: {
  agent: Agent;
  initial: EvalCase | null;
  draft: EvalCaseBody | null;
  findingId?: string;
  prId?: string;
  onSaved?: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("eval.caseEditor");
  const source = initial ?? draft;
  /** Preview-from-finding: the diff/PR meta are the finding's own stored diff, not user-editable. */
  const readOnly = !initial && !!findingId;
  const [name, setName] = React.useState(source?.name ?? "");
  const [diff, setDiff] = React.useState(source?.input_diff ?? "");
  const [title, setTitle] = React.useState(source?.input_meta.title ?? "");
  const [body, setBody] = React.useState(source?.input_meta.body ?? "");
  const [expected, setExpected] = React.useState(
    source ? JSON.stringify(source.expected_output, null, 2) : EMPTY_EXPECTED,
  );
  const [runOnSave, setRunOnSave] = React.useState(true);
  const [tab, setTab] = React.useState<InputTab>("diff");
  const [savedId, setSavedId] = React.useState<string | null>(initial?.id ?? null);
  const [serverErr, setServerErr] = React.useState<ServerReason | null>(null);
  const [busy, setBusy] = React.useState(false);

  const create = useCreateEvalCase(agent.id);
  const update = useUpdateEvalCase(agent.id);
  const createFromFinding = useCreateCaseFromFinding(prId ?? "");
  const run = useRunEvalCase(agent.id);
  const live = useEvalCase(savedId).data;

  const reasons = validateCaseForm({ name, diff, expected });
  const invalid = Object.keys(reasons).length > 0;
  const files = React.useMemo(() => parseDiffFiles(diff), [diff]);
  const text = (r?: { key: string; values?: Record<string, string> }) => (r ? t(r.key, r.values) : undefined);
  const at = (field: ServerReason["field"]) => (serverErr?.field === field ? text(serverErr) : undefined);

  /** Persists the form; returns the case id, or null after surfacing the server's reason (or, on a
   *  409 race for a finding-sourced case, after treating the pre-existing case as this save's result). */
  const save = async (): Promise<string | null> => {
    const parsed = parseExpected(expected);
    if (!parsed.ok) return null;
    setServerErr(null);
    if (findingId) {
      try {
        const c = await createFromFinding.mutateAsync({
          findingId,
          override: { name: name.trim(), expected_output: parsed.items },
        });
        setSavedId(c.id);
        return c.id;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          onSaved?.();
          onClose();
          return null;
        }
        setServerErr(serverReason(e));
        return null;
      }
    }
    const payload: EvalCaseBody = {
      name: name.trim(),
      input_diff: diff,
      input_meta: { title, body },
      expected_output: parsed.items,
    };
    try {
      const c = savedId ? await update.mutateAsync({ id: savedId, body: payload }) : await create.mutateAsync(payload);
      setSavedId(c.id);
      return c.id;
    } catch (e) {
      setServerErr(serverReason(e));
      return null;
    }
  };
  const start = async (id: string) => {
    try {
      await run.mutateAsync(id);
    } catch {
      setServerErr({ field: "general", key: "runFailedToStart" });
    }
  };
  const guarded = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const onSave = guarded(async () => {
    const id = await save();
    if (!id) return;
    onSaved?.();
    if (runOnSave) await start(id);
    onClose();
  });
  const onRunCase = guarded(async () => {
    const id = await save();
    if (id) await start(id);
  });

  const tabs = [
    { key: "diff", label: t("tabs.diff") },
    { key: "files", label: t("tabs.files") },
    { key: "meta", label: t("tabs.prMeta") },
  ];

  return (
    <AccessibleModal
      width={1100}
      title={source ? t("caseTitle", { name: source.name }) : t("newCase")}
      subtitle={t("subtitle", { agent: agent.name })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <label style={s.toggle}>
            <Toggle on={runOnSave} onChange={setRunOnSave} />
            {t("runOnSave")}
          </label>
          <Button kind="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button kind="secondary" icon="Play" disabled={invalid || busy} onClick={onRunCase}>
            {t("runCase")}
          </Button>
          <Button kind="primary" icon="Check" disabled={invalid || busy} loading={busy} onClick={onSave}>
            {t("save")}
          </Button>
        </div>
      }
    >
      <div style={s.split}>
        <div style={s.left}>
          <FormField label={t("nameLabel")} required>
            <TextInput mono value={name} onChange={setName} placeholder={t("namePlaceholder")} maxLength={NAME_MAX} aria-label={t("nameLabel")} />
          </FormField>
          <div style={s.inputLabel}>{t("inputLabel")}</div>
          <Tabs tabs={tabs} value={tab} onChange={(k) => setTab(k as InputTab)} pad="0" />
          {tab === "diff" && (
            <div style={{ paddingTop: 12 }}>
              <DiffInput
                value={diff}
                onChange={setDiff}
                error={at("diff") ?? (diff ? text(reasons.diff) : undefined)}
                readOnly={readOnly}
              />
            </div>
          )}
          {tab === "files" && <FilesList files={files} />}
          {tab === "meta" && <PrMetaInput title={title} body={body} onTitle={setTitle} onBody={setBody} readOnly={readOnly} />}
        </div>
        <div style={s.right}>
          <ExpectedOutputEditor
            value={expected}
            onChange={setExpected}
            onSkeleton={() => setExpected(addSkeleton(expected, diff))}
            valid={!reasons.expected}
            error={at("expected") ?? text(reasons.expected)}
          />
          {at("general") && <div style={s.error}>{at("general")}</div>}
          <RunResultPanel result={live?.latest_result ?? null} provider={agent.provider} />
        </div>
      </div>
    </AccessibleModal>
  );
}
