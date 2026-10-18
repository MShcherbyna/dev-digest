/* RemoveInstallationDialog — confirmation before the removal PR is opened (AC-33, AC-36).
   Nothing is sent until the user confirms. A failure keeps the dialog open with the reason
   and turns the confirm button into Retry. Esc / focus trap / focus return come from
   AccessibleModal. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { CiInstallation } from "@devdigest/shared";
import { AccessibleModal } from "@/components/accessible-modal";
import { isGithubUrl } from "@/lib/github-urls";
import { useRemoveCiInstallation } from "@/lib/hooks/ci";
import { useToast } from "@/lib/toast";
import { ciErrorMessage } from "../../ci-errors";
import { s } from "./styles";

export function RemoveInstallationDialog({
  installation,
  agentName,
  returnFocusTo,
  onClose,
}: {
  installation: CiInstallation;
  agentName: string;
  /** The "Remove" button that opened the dialog. */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const t = useTranslations("ci");
  const toast = useToast();
  const remove = useRemoveCiInstallation();

  const confirm = () =>
    remove.mutate(installation.id, {
      onSuccess: (res) => {
        const link = isGithubUrl(res.pr_url) ? { href: res.pr_url, label: t("ciTab.removeDialog.viewPr") } : undefined;
        toast.success(t("ciTab.removeDialog.doneToast"), link);
        onClose();
      },
    });

  return (
    <AccessibleModal
      width={440}
      title={t("ciTab.removeDialog.title", { agent: agentName, repo: installation.repo })}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
      footer={
        <div style={s.footer}>
          <Button kind="secondary" onClick={onClose}>
            {t("ciTab.removeDialog.cancel")}
          </Button>
          <Button kind="danger" onClick={confirm} loading={remove.isPending}>
            {remove.isError
              ? t("ciTab.removeDialog.retry")
              : remove.isPending
                ? t("ciTab.removeDialog.removing")
                : t("ciTab.removeDialog.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <p style={s.message}>{t("ciTab.removeDialog.body", { repo: installation.repo })}</p>
        {remove.isError && (
          <p role="alert" style={s.error}>
            {ciErrorMessage(t, remove.error)}
          </p>
        )}
      </div>
    </AccessibleModal>
  );
}
