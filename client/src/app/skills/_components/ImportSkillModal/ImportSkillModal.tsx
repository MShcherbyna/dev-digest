/* ImportSkillModal — pick a .md or a .zip (SKILL.md is extracted in the browser), read its TEXT, ask the server
   for an editable preview, then Confirm & save (source: imported_url).
   Nothing is persisted before confirm; the file is never uploaded or executed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, TextInput } from "@devdigest/ui";
import type { SkillImportPreview, SkillType } from "@devdigest/shared";
import { useCreateSkill, useImportSkillPreview } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPES, estimateTokens } from "@/lib/skill-format";
import { SkillBodyEditor } from "../SkillBodyEditor";
import { ACCEPT_ATTR, MAX_ARCHIVE_BYTES, MODAL_WIDTH } from "./constants";
import { ArchiveError, extractSkillFromZip, isMarkdownFile, isZipFile } from "./helpers";
import { s } from "./styles";

export function ImportSkillModal({ onClose, onImported }: { onClose: () => void; onImported: (id: string) => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const preview = useImportSkillPreview();
  const create = useCreateSkill();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [reading, setReading] = React.useState(false);
  const [readError, setReadError] = React.useState<string | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [form, setForm] = React.useState<SkillImportPreview | null>(null);
  const patch = (p: Partial<SkillImportPreview>) => setForm((f) => (f ? { ...f, ...p } : f));

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReadError(null);
    setForm(null);
    setWarnings([]);
    const zip = isZipFile(file.name);
    if (!zip && !isMarkdownFile(file.name)) {
      setReadError(t("import.previewFailed"));
      return;
    }
    if (zip && file.size > MAX_ARCHIVE_BYTES) {
      setReadError(t("import.archiveTooLarge"));
      return;
    }
    setReading(true);
    try {
      const source = zip
        ? extractSkillFromZip(new Uint8Array(await file.arrayBuffer()))
        : { filename: file.name, content: await file.text() };
      const result = await preview.mutateAsync(source);
      setForm(result);
      setWarnings(result.warnings);
    } catch (e) {
      if (e instanceof ArchiveError) {
        setReadError(t(`import.archive.${e.code}`));
      } else {
        // Server failures already raise the global error toast; this covers the inline note.
        setReadError(t("import.previewFailed"));
      }
    } finally {
      setReading(false);
    }
  };

  const confirm = () => {
    if (!form) return;
    create.mutate(
      {
        name: form.name,
        description: form.description,
        type: form.type,
        body: form.body,
        source: "imported_url",
      },
      {
        onSuccess: (skill) => {
          toast.success(t("import.savedToast"));
          onImported(skill.id);
        },
      },
    );
  };

  const canConfirm = !!form && form.name.trim().length > 0 && form.body.trim().length > 0 && !create.isPending;
  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose} disabled={create.isPending}>
            {t("import.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={confirm} disabled={!canConfirm}>
            {create.isPending ? t("import.saving") : t("import.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          data-testid="skill-file-input"
          style={s.hiddenInput}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button
          kind="secondary"
          icon="Upload"
          loading={reading}
          onClick={() => inputRef.current?.click()}
        >
          {reading ? t("import.reading") : form ? t("import.pickAnother") : t("import.pick")}
        </Button>
        {readError && (
          <div role="alert" style={s.error}>
            {readError}
          </div>
        )}

        {form && (
          <div style={s.preview}>
            <div role="note" style={s.trust}>
              {t("import.trustWarning")}
            </div>
            {warnings.length > 0 && (
              <div style={s.warnings}>
                <strong>{t("import.warningsTitle")}</strong>
                <ul style={s.warningList}>
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <FormField label={t("import.name")} required>
              <TextInput value={form.name} onChange={(v) => patch({ name: v })} />
            </FormField>
            <FormField label={t("import.description")}>
              <TextInput value={form.description} onChange={(v) => patch({ description: v })} />
            </FormField>
            <FormField label={t("import.type")}>
              <SelectInput value={form.type} onChange={(v) => patch({ type: v as SkillType })} options={typeOptions} />
            </FormField>
            <FormField label={t("import.body")} required>
              <SkillBodyEditor
                value={form.body}
                savedValue={form.body}
                name={form.name}
                onChange={(v) => patch({ body: v, tokens: estimateTokens(v) })}
              />
            </FormField>
          </div>
        )}
      </div>
    </Modal>
  );
}
