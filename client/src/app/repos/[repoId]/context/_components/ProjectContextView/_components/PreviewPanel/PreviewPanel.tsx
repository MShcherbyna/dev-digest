/* PreviewPanel — right panel: file name, static "Preview" label, used-by count
   and the rendered (sanitised) markdown of the selected doc. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { DocMarkdown } from "@/components/doc-markdown";
import { ApiError } from "@/lib/api";
import { useContextFile } from "@/lib/hooks/project-context";
import type { ContextFileInfo } from "@/lib/types";
import { s } from "../../styles";

export function PreviewPanel({ repoId, file }: { repoId: string; file: ContextFileInfo }) {
  const t = useTranslations("context");
  const { data, isLoading, isError, error, refetch } = useContextFile(repoId, file.path);
  const status = error instanceof ApiError ? error.status : 0;
  return (
    <section style={s.right}>
      <div style={s.rightHead}>
        <span className="mono" style={s.fileName}>
          {file.path}
        </span>
        <span style={s.segmented}>
          <span style={s.segment}>{t("page.preview")}</span>
        </span>
        <span style={s.usedBy}>
          <Icon.Cpu size={14} />
          {t("page.usedBy", { count: file.used_by })}
        </span>
      </div>
      <div style={s.content}>
        {isLoading ? (
          <Skeleton height={160} />
        ) : isError && status === 413 ? (
          <p style={s.notice2}>{t("preview.tooLarge")}</p>
        ) : isError && status === 404 ? (
          <p style={s.notice2}>{t("preview.notFound")}</p>
        ) : isError ? (
          <ErrorState title={t("preview.errorTitle")} body={t("preview.errorBody")} onRetry={() => void refetch()} />
        ) : (
          <DocMarkdown>{data?.content}</DocMarkdown>
        )}
      </div>
    </section>
  );
}
