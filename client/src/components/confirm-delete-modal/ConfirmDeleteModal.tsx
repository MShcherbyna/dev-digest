/* ConfirmDeleteModal — in-app replacement for window.confirm() on destructive
   deletes: title, message, Cancel / Delete, and a close (X) button. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { s } from "./styles";

export function ConfirmDeleteModal({
  title,
  message,
  pending,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("common");
  return (
    <Modal
      width={440}
      title={title}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="secondary" onClick={onClose}>
            {t("actions.cancel")}
          </Button>
          <Button kind="danger" onClick={onConfirm} loading={pending}>
            {t("actions.delete")}
          </Button>
        </div>
      }
    >
      <p style={s.message}>{message}</p>
    </Modal>
  );
}
