/* OnboardingTourView — /repos/:repoId/onboarding. Per-repository guided tour
   (GET/POST /repos/:id/onboarding). Server state stays in the query cache;
   only the failed-generation error and the collapse map are local. */
"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useGenerateOnboarding, useOnboarding, type OnboardingState } from "@/lib/hooks/onboarding";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { ArchitectureSection } from "./_components/ArchitectureSection";
import { CriticalPathList } from "./_components/CriticalPathList";
import { FirstTaskCards } from "./_components/FirstTaskCards";
import { OnThisPage } from "./_components/OnThisPage";
import { ReadingPathList } from "./_components/ReadingPathList";
import { RunLocallyList } from "./_components/RunLocallyList";
import { SectionCard } from "./_components/SectionCard";
import { TourHeader } from "./_components/TourHeader";
import { TourNotices } from "./_components/TourNotices";
import { TourSkeleton } from "./_components/TourSkeleton";
import { MISSING_KEY_CODE, QUIET_ERROR_CODES, SECTION_KEYS, type SectionKey } from "./constants";
import { errorCause, errorCode, sectionDomId } from "./helpers";
import { s } from "./styles";
import { useActiveSection } from "./use-active-section";
import { useSectionCollapse } from "./use-section-collapse";

export function OnboardingTourView() {
  const t = useTranslations("onboarding");
  const toast = useToast();
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo, repos, reposLoaded } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, error, refetch } = useOnboarding(repoId);
  const mutation = useGenerateOnboarding(repoId);
  const collapse = useSectionCollapse();

  const hasTour = !!data?.tour;
  const { active, setActive } = useActiveSection(hasTour);

  const repoName = activeRepo?.full_name ?? repoId;
  const crumb = [{ label: repoName, mono: true }, { label: t("title") }];
  const generating = !!data?.generating || mutation.isPending;
  const cause = errorCause(mutation.error);

  function generate() {
    mutation.mutate(undefined, {
      onError: (err) => {
        const code = errorCode(err);
        // Quiet codes: the refetch (and polling) shows the real state.
        if (code && (QUIET_ERROR_CODES as readonly string[]).includes(code)) return;
        // Without a tour the failure is rendered inline (see body below).
        if (hasTour) toast.error(err instanceof Error ? err.message : t("error.body"));
      },
    });
  }

  function select(key: SectionKey) {
    collapse.expand(key);
    requestAnimationFrame(() => {
      document.getElementById(sectionDomId(key))?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
    setActive(key);
  }

  const notFound = repoNotFound || (isError && error instanceof ApiError && error.status === 404);

  let body: React.ReactNode;
  if (reposLoaded && repos.length === 0) {
    body = <EmptyState icon="Boxes" title={t("noRepo")} />;
  } else if (notFound) {
    body = <RepoNotFound />;
  } else if (!reposLoaded || isLoading) {
    body = <TourSkeleton />;
  } else if (isError || !data) {
    body = (
      <ErrorState
        title={t("loadError.title")}
        body={error instanceof ApiError ? error.message : t("loadError.body")}
        onRetry={() => void refetch()}
      />
    );
  } else if (data.tour) {
    body = (
      <Tour
        state={data}
        tour={data.tour}
        repoId={repoId}
        repoName={activeRepo?.name ?? repoName}
        fullName={activeRepo?.full_name ?? repoName}
        generating={generating}
        onGenerate={generate}
        collapse={collapse}
        active={active}
        onSelect={select}
      />
    );
  } else if (!data.cloned) {
    body = <EmptyState icon="Boxes" title={t("notCloned.title")} body={t("notCloned.body", { repo: repoName })} />;
  } else if (mutation.isError && !generating && !isQuiet(mutation.error)) {
    body =
      errorCode(mutation.error) === MISSING_KEY_CODE ? (
        <ErrorState
          title={t("error.title")}
          body={
            <>
              {t("error.missingKeyBody")} <Link href="/settings/api-keys" style={{ color: "var(--accent-text)" }}>{t("error.apiKeysLink")}</Link>
            </>
          }
        />
      ) : (
        <ErrorState title={t("error.title")} body={cause ? `${t("error.body")} ${t("error.reason", { cause })}` : t("error.body")} onRetry={generate} />
      );
  } else {
    body = (
      <EmptyState
        icon="Boxes"
        title={t("generate.title")}
        body={t("generate.body")}
        cta={generating ? t("generate.generating") : t("generate.cta")}
        ctaLoading={generating}
        onCta={generate}
      />
    );
  }

  return <AppShell crumb={crumb}>{body}</AppShell>;
}

function isQuiet(err: unknown): boolean {
  const code = errorCode(err);
  return !!code && (QUIET_ERROR_CODES as readonly string[]).includes(code);
}

type Collapse = ReturnType<typeof useSectionCollapse>;

function Tour({
  state,
  tour,
  repoId,
  repoName,
  fullName,
  generating,
  onGenerate,
  collapse,
  active,
  onSelect,
}: {
  state: OnboardingState;
  tour: NonNullable<OnboardingState["tour"]>;
  repoId: string;
  repoName: string;
  fullName: string;
  generating: boolean;
  onGenerate: () => void;
  collapse: Collapse;
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
}) {
  const card = (key: SectionKey, children: React.ReactNode) => (
    <SectionCard key={key} sectionKey={key} collapsed={collapse.isCollapsed(key)} onToggle={() => collapse.toggle(key)}>
      {children}
    </SectionCard>
  );
  const sections: Record<SectionKey, React.ReactNode> = {
    architecture: <ArchitectureSection architecture={tour.architecture} />,
    "critical-paths": <CriticalPathList items={tour.critical_paths} fullName={fullName} commitSha={tour.commit_sha} />,
    "run-locally": <RunLocallyList items={tour.run_locally} />,
    "reading-path": <ReadingPathList items={tour.reading_path} />,
    "first-tasks": <FirstTaskCards items={tour.first_tasks} />,
  };
  return (
    <div style={s.page}>
      <div style={s.rail}>
        <OnThisPage active={active} onSelect={onSelect} />
      </div>
      <div style={s.main}>
        <TourHeader
          repoId={repoId}
          repoName={repoName}
          tour={tour}
          cloned={state.cloned}
          generating={generating}
          onRegenerate={onGenerate}
        />
        <TourNotices
          partial={tour.partial_index}
          stale={state.stale}
          cloned={state.cloned}
          generating={generating}
          onRegenerate={onGenerate}
        />
        {SECTION_KEYS.map((key) => card(key, sections[key]))}
      </div>
    </div>
  );
}
