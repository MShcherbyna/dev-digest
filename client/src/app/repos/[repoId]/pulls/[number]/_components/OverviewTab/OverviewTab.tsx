"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { PrBriefBlock } from "../PrBriefBlock";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  repoId: string | null | undefined;
  repoFullName: string | null;
  headSha: string;
  /** Paths of the PR's changed files — a brief link may only open one of these. */
  diffPaths: string[];
  onOpenFile: (path: string, line: number | null) => void;
}

export function OverviewTab({
  prId,
  prBody,
  repoId,
  repoFullName,
  headSha,
  diffPaths,
  onOpenFile,
}: OverviewTabProps) {
  return (
    <>
      <PrBriefBlock
        prId={prId}
        repoId={repoId}
        repoFullName={repoFullName}
        headSha={headSha}
        diffPaths={diffPaths}
        onOpenFile={onOpenFile}
      />
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
