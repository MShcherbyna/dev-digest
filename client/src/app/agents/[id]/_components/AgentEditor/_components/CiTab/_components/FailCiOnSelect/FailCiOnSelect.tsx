/* FailCiOnSelect — the agent's `ci_fail_on`, the same value as "CI gate" on the Config tab
   (AC-27). Changing it saves the agent, which creates a new version, so installations of
   the old version turn `outdated` until updated. Value and labels reuse the Config tab's. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SelectInput } from "@devdigest/ui";
import type { Agent, CiFailOn } from "@devdigest/shared";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { useToast } from "@/lib/toast";
import { CI_FAIL_ON_VALUES } from "../../constants";
import { s } from "./styles";

export function FailCiOnSelect({ agent }: { agent: Agent }) {
  const t = useTranslations("ci.ciTab");
  const ta = useTranslations("agents");
  const toast = useToast();
  const update = useUpdateAgent();
  const options = CI_FAIL_ON_VALUES.map((v) => ({ value: v, label: ta(`config.ciFailOnOptions.${v}`) }));

  // The mutation writes the saved agent back into the query cache, so `agent.ci_fail_on` is the truth.
  const onChange = (v: string) =>
    update.mutate(
      { id: agent.id, patch: { ci_fail_on: v as CiFailOn } },
      { onSuccess: (saved) => toast.success(t("failCiOnSaved", { version: saved.version })) },
    );

  // The <label> wraps the select, so the control is named "Fail CI on" without an id.
  return (
    <div>
      <label style={s.label}>
        <span style={s.labelText}>{t("failCiOn")}</span>
        <SelectInput value={agent.ci_fail_on} onChange={onChange} options={options} />
      </label>
      <div style={s.hint}>{ta("config.ciFailOnHint")}</div>
    </div>
  );
}
