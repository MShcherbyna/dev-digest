/* FindingsSummary — the PR list's Findings-column severity counter. Thin
   wrapper around SeverityFindingsBreakdown: supplies the dash/zero-findings
   states (from the server-precomputed PrMeta.findings), and lazily fetches
   the latest review's findings only once the popover actually opens. */
"use client";

import React from "react";
import type { PrMeta } from "@/lib/types";
import { usePrReviews } from "@/lib/hooks/reviews";
import { SeverityFindingsBreakdown } from "../SeverityFindingsBreakdown";
import { toSeverityCounts, latestReviewFindings } from "./helpers";
import { s } from "./styles";

export function FindingsSummary({ pr }: { pr: PrMeta }) {
  const [open, setOpen] = React.useState(false);
  const { data: reviews } = usePrReviews(open ? pr.id : null);

  if (!pr.findings) return <span style={s.muted}>—</span>;
  const counts = toSeverityCounts(pr.findings);
  const total = counts.CRITICAL + counts.WARNING + counts.SUGGESTION;
  if (total === 0) return <span style={s.muted}>0 findings</span>;

  return (
    <SeverityFindingsBreakdown
      counts={counts}
      findings={open && reviews ? latestReviewFindings(reviews) : undefined}
      onOpenChange={setOpen}
    />
  );
}
