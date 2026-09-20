/* CreateSkillModal — merge the accepted conventions into one skill. Only name and
   description are edited here; the body is built server-side from the accepted
   conventions (rejected ones no longer exist). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, Textarea, TextInput } from "@devdigest/ui";
import { useCreateSkillFromConventions, type Convention } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { BODY_ROWS, MODAL_WIDTH } from "./constants";
import { buildSkillBody } from "./helpers";
import { s } from "./styles";

export function CreateSkillModal({
  repoId,
  repoFullName,
  conventions,
  onClose,
  onCreated,
}: {
  repoId: string;
  repoFullName: string;
  /** The accepted conventions being merged. */
  conventions: Convention[];
  onClose: () => void;
  /** Called with the new skill's id after it is saved (the view opens it). */
  onCreated: (skillId: string) => void;
}) {
  const t = useTranslations("conventions.modal");
  const toast = useToast();
  const create = useCreateSkillFromConventions(repoId);
  const shortName = repoFullName.split("/").pop() ?? repoFullName;
  const count = conventions.length;
  const [name, setName] = React.useState(`${shortName}-conventions`);
  const [description, setDescription] = React.useState(
    t("defaultDescription", { count, repo: shortName }),
  );
  const [body, setBody] = React.useState(() => buildSkillBody(conventions));
  const canCreate = name.trim().length > 0 && body.trim().length > 0 && !create.isPending;

  const submit = () =>
    create.mutate(
      { name: name.trim(), description, body, convention_ids: conventions.map((c) => c.id) },
      {
        onSuccess: (skill) => {
          toast.success(t("created"));
          onCreated(skill.id);
        },
      },
    );

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("title")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.hint}>{t("hint")}</span>
          <Button kind="secondary" onClick={onClose} disabled={create.isPending}>
            {t("cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={!canCreate}>
            {create.isPending ? t("creating") : t("create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div role="note" style={s.banner}>
          {t.rich("banner", {
            count,
            repo: shortName,
            b: (chunks) => <strong style={s.bannerStrong}>{chunks}</strong>,
            link: (chunks) => (
              <a
                href={`https://github.com/${repoFullName}`}
                target="_blank"
                rel="noreferrer"
                style={s.bannerLink}
              >
                {chunks}
              </a>
            ),
          })}
        </div>
        <FormField label={t("name")} required>
          <TextInput value={name} onChange={setName} aria-label={t("name")} />
        </FormField>
        <FormField label={t("description")}>
          <TextInput value={description} onChange={setDescription} aria-label={t("description")} />
        </FormField>
        <FormField label={t("body")} required>
          <Textarea value={body} onChange={setBody} rows={BODY_ROWS} mono />
        </FormField>
      </div>
    </Modal>
  );
}
