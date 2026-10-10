/* DocPreviewModal — read-only rendered preview of one discovered doc. Wraps the
   vendored Modal (which has no Escape handling or focus trap, so both are added here). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Modal, Skeleton } from "@devdigest/ui";
import { DocMarkdown } from "@/components/doc-markdown";
import { useContextFile } from "@/lib/hooks/project-context";
import { ApiError } from "@/lib/api";
import { useFocusTrap } from "./focus-trap";
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

  const rootRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(rootRef);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const status = error instanceof ApiError ? error.status : 0;
  return (
    <div ref={rootRef}>
      <Modal
        width={860}
        title={<span className="mono">{path}</span>}
        onClose={onClose}
      >
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
      </Modal>
    </div>
  );
}
