/* ProjectContextView — /repos/:repoId/context. Read-only browser of the active
   repo's discovered markdown docs (list left, preview right). GET /repos/:id/context. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useProjectContext } from "@/lib/hooks/project-context";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { FileListPanel } from "./_components/FileListPanel";
import { PreviewPanel } from "./_components/PreviewPanel";
import { resolveSelected, sortFiles } from "./helpers";
import { s } from "./styles";

export function ProjectContextView() {
  const t = useTranslations("context");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo, repos, reposLoaded } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: listing, isLoading, isError, error, refetch } = useProjectContext(repoId);
  const [selected, setSelected] = React.useState<string | null>(null);

  const repoName = activeRepo?.full_name ?? repoId;
  const crumb = [{ label: repoName, mono: true }, { label: t("title") }];

  // No repository exists at all (AC-11) is "select a repository"; a stale/unknown id among existing repos stays RepoNotFound.
  const noActiveRepo = reposLoaded && repos.length === 0;

  let body: React.ReactNode;
  if (noActiveRepo) {
    body = <EmptyState icon="Folder" title={t("list.noRepo")} />;
  } else if (repoNotFound) {
    body = <RepoNotFound />;
  } else if (isLoading) {
    body = (
      <div style={s.layout}>
        <div style={{ ...s.left, padding: 16, gap: 10 }}>
          <Skeleton height={20} />
          <Skeleton height={20} />
          <Skeleton height={20} />
        </div>
      </div>
    );
  } else if (isError || !listing) {
    body = (
      <ErrorState
        title={t("page.errorTitle")}
        body={error instanceof ApiError ? error.message : t("page.errorBody")}
        onRetry={() => void refetch()}
      />
    );
  } else if (!listing.cloned) {
    body = <EmptyState icon="Folder" title={t("page.notClonedTitle")} body={t("page.notClonedBody", { repo: repoName })} />;
  } else if (listing.files.length === 0) {
    body = <EmptyState icon="Folder" title={t("page.emptyTitle")} body={t("page.emptyBody", { glob: listing.glob })} />;
  } else {
    const files = sortFiles(listing.files);
    const current = resolveSelected(files, selected);
    const file = files.find((f) => f.path === current);
    body = (
      <div style={s.layout}>
        <FileListPanel listing={listing} repoName={repoName} selected={current} onSelect={setSelected} onRefresh={() => void refetch()} />
        {file && <PreviewPanel key={file.path} repoId={repoId} file={file} />}
      </div>
    );
  }

  return <AppShell crumb={crumb}>{body}</AppShell>;
}
