/* DocPreviewModal — read-only rendered preview of one discovered doc. Wraps the
   vendored Modal (which has no Escape handling or focus trap, so both are added here). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { AccessibleModal } from "@/components/accessible-modal";
import { DocMarkdown } from "@/components/doc-markdown";
import { useContextFile } from "@/lib/hooks/project-context";
import { ApiError } from "@/lib/api";
import { s } from "./styles";

export function DocPreviewModal({
  repoId,
  path,
  onClose,
}: {
  repoId: string;
  path: string;
  onClose: () => void;
}) {
  const t = useTranslations("context");
  const { data, isLoading, isError, error, refetch } = useContextFile(
    repoId,
    path,
  );

  const status = error instanceof ApiError ? error.status : 0;
  return (
    <AccessibleModal width={860} title={<span className="mono">{path}</span>} onClose={onClose}>
        <div style={s.body}>
          {isLoading ? (
            <Skeleton height={160} />
          ) : isError && status === 413 ? (
            <p style={s.notice}>{t("preview.tooLarge")}</p>
          ) : isError && status === 404 ? (
            <p style={s.notice}>{t("preview.notFound")}</p>
          ) : isError ? (
            <ErrorState
              title={t("preview.errorTitle")}
              body={t("preview.errorBody")}
              onRetry={() => void refetch()}
            />
          ) : (
            <DocMarkdown>{data?.content}</DocMarkdown>
          )}
        </div>
    </AccessibleModal>
  );
}
