/* /conventions — Skills Lab. Scan the active repo, review the extracted
   candidates (accept / edit / reject) and merge the accepted ones into a skill. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import {
  useConventions,
  useExtractConventions,
  useRejectConvention,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { ConventionCard } from "../ConventionCard";
import { CreateSkillModal } from "../CreateSkillModal";
import { SKELETON_COUNT, SKELETON_HEIGHT } from "./constants";
import { acceptedOf, shortRepoName } from "./helpers";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions.page");
  const router = useRouter();
  const { activeRepo } = useActiveRepo();
  const repoId = activeRepo?.id;
  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const reject = useRejectConvention(repoId);
  const [creating, setCreating] = React.useState(false);

  const list = data?.conventions ?? [];
  const accepted = acceptedOf(list);
  const scanning = extract.isPending;
  const showEmpty = !isLoading && !isError && !scanning && list.length === 0;

  return (
    <AppShell crumb={[{ label: t("crumbLab") }, { label: t("crumbConventions") }]}>
      {creating && activeRepo && (
        <CreateSkillModal
          repoId={activeRepo.id}
          repoFullName={activeRepo.full_name}
          conventions={accepted}
          onClose={() => setCreating(false)}
          onCreated={(id) => router.push(`/skills/${id}`)}
        />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("headingPrefix")}
              <span style={s.repoName}>
                {activeRepo ? shortRepoName(activeRepo.full_name) : t("repoFallback")}
              </span>
            </h1>
            {list.length > 0 && (
              <p style={s.subtitle}>{t("acceptedCount", { accepted: accepted.length, total: list.length })}</p>
            )}
          </div>
          {activeRepo && (
            <div style={s.actions}>
              <Button kind="secondary" icon="RefreshCw" loading={scanning} onClick={() => extract.mutate()}>
                {scanning ? t("scanning") : t("rescan")}
              </Button>
              <Button
                kind="primary"
                icon="Sparkles"
                disabled={accepted.length === 0}
                onClick={() => setCreating(true)}
              >
                {t("createSkill")}
              </Button>
            </div>
          )}
        </div>

        {!activeRepo && <EmptyState icon="ListChecks" title={t("noRepo")} />}
        {activeRepo && (isLoading || scanning) && (
          <div style={s.list}>
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <Skeleton key={i} height={SKELETON_HEIGHT} />
            ))}
          </div>
        )}
        {isError && <ErrorState body={t("loadError")} onRetry={() => refetch()} />}
        {activeRepo && showEmpty && (
          <EmptyState
            icon="ListChecks"
            title={t("empty.title")}
            body={t("empty.body")}
            cta={t("empty.cta")}
            onCta={() => extract.mutate()}
          />
        )}
        {activeRepo && !scanning && list.length > 0 && (
          <div style={s.list}>
            {list.map((c) => (
              <ConventionCard
                key={c.id}
                convention={c}
                repoFullName={activeRepo.full_name}
                headSha={data?.head_sha ?? activeRepo.default_branch}
                onAccept={() => update.mutate({ id: c.id, patch: { accepted: true } })}
                onReject={() => reject.mutate(c.id)}
                onSaveRule={(rule) => update.mutate({ id: c.id, patch: { rule } })}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
