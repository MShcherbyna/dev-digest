/* ProjectContextView — /repos/:repoId/context. Read-only browser of the active
   repo's discovered markdown docs (list left, preview right). GET /repos/:id/context. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useProjectContext } from "@/lib/hooks/project-context";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { FileListPanel } from "./_components/FileListPanel";
import { PreviewPanel } from "./_components/PreviewPanel";
import { listBodyState, resolveSelected, sortFiles } from "./helpers";
import { useReindexFlow } from "./use-reindex-flow";
import { s } from "./styles";

export function ProjectContextView() {
  const t = useTranslations("context");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo, repos, reposLoaded } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: listing, isLoading, error, refetch } = useProjectContext(repoId);
  const flow = useReindexFlow(repoId, listing);
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
  } else if (!listing) {
    body = (
      <ErrorState
        title={t("page.errorTitle")}
        body={error instanceof ApiError ? error.message : t("page.errorBody")}
        onRetry={() => void refetch()}
      />
    );
  } else {
    const state = listBodyState(listing);
    let listBody: React.ReactNode;
    if (state === "notCloned") {
      listBody = <EmptyState icon="Folder" title={t("page.notClonedTitle")} body={t("page.notClonedBody", { repo: repoName })} />;
    } else if (state === "notIndexed") {
      listBody = (
        <EmptyState
          icon="Folder"
          title={t("page.notIndexed")}
          body={
            <>
              <div>{t("page.notIndexedBody")}</div>
              <div style={{ marginTop: 12 }}>
                <Button kind="secondary" disabled={flow.running} onClick={flow.start}>
                  {t("page.reindex")}
                </Button>
              </div>
            </>
          }
        />
      );
    } else if (state === "empty") {
      listBody = <EmptyState icon="Folder" title={t("page.emptyTitle")} body={t("page.emptyBody", { glob: listing.glob })} />;
    }
    const files = sortFiles(listing.files);
    const current = resolveSelected(files, selected);
    const file = state === "files" ? files.find((f) => f.path === current) : undefined;
    body = (
      <div style={s.layout}>
        <FileListPanel
          listing={listing}
          repoName={repoName}
          selected={current}
          onSelect={setSelected}
          reindex={{ running: flow.running, onClick: flow.start }}
        >
          {listBody}
        </FileListPanel>
        {file && <PreviewPanel key={file.path} repoId={repoId} file={file} />}
      </div>
    );
  }

  return <AppShell crumb={crumb}>{body}</AppShell>;
}
