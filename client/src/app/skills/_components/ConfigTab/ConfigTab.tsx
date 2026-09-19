/* ConfigTab — skill form: Enabled, Name*, Description, Type, body editor,
   Save / Cancel. `skill === null` is the "Create new" (empty) form.
   The parent keys this component on skill id+version, so local form state
   re-initialises after a save without an effect. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPES } from "@/lib/skill-format";
import { SkillBodyEditor } from "../SkillBodyEditor";
import { isDirty, isValid } from "./helpers";
import { s } from "./styles";

export function ConfigTab({
  skill,
  onCreated,
  onCancelNew,
}: {
  skill: Skill | null;
  onCreated?: (id: string) => void;
  onCancelNew?: () => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const update = useUpdateSkill();

  const initial = React.useMemo(
    () => ({
      name: skill?.name ?? "",
      description: skill?.description ?? "",
      type: (skill?.type ?? "rubric") as SkillType,
      body: skill?.body ?? "",
      enabled: skill?.enabled ?? true,
    }),
    [skill],
  );
  const [form, setForm] = React.useState(initial);
  const patch = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  const pending = create.isPending || update.isPending;
  const canSave = isValid(form) && !pending && (skill === null || isDirty(form, initial));

  const save = () => {
    if (skill === null) {
      create.mutate(
        { ...form, source: "manual" },
        {
          onSuccess: (created) => {
            toast.success(t("config.createdToast"));
            onCreated?.(created.id);
          },
        },
      );
    } else {
      update.mutate(
        { id: skill.id, patch: form },
        { onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })) },
      );
    }
  };

  const cancel = () => (skill === null ? onCancelNew?.() : setForm(initial));

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={form.enabled} onChange={(v) => patch({ enabled: v })} size={16} />
        </label>
      </div>
      <FormField label={t("config.name")} required>
        <TextInput value={form.name} onChange={(v) => patch({ name: v })} placeholder={t("config.namePlaceholder")} />
      </FormField>
      <FormField label={t("config.description")} hint={t("config.descriptionHint")}>
        <TextInput
          value={form.description}
          onChange={(v) => patch({ description: v })}
          placeholder={t("config.descriptionPlaceholder")}
        />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput value={form.type} onChange={(v) => patch({ type: v as SkillType })} options={typeOptions} />
      </FormField>
      <FormField label={t("config.body")} required>
        <SkillBodyEditor
          value={form.body}
          savedValue={initial.body}
          name={form.name}
          onChange={(v) => patch({ body: v })}
        />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={!canSave}>
          {pending ? t("config.saving") : skill === null ? t("config.create") : t("config.save")}
        </Button>
        <Button kind="ghost" onClick={cancel} disabled={pending}>
          {t("config.cancel")}
        </Button>
      </div>
    </div>
  );
}
