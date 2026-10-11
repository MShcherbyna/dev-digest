import React from "react";
import { DocMarkdown } from "@/components/doc-markdown";
import type { OnboardingTour } from "@/lib/hooks/onboarding";
import { ArchitectureDiagram } from "../ArchitectureDiagram";

/** Model prose goes through DocMarkdown only (no raw HTML, http(s) links only). */
export function ArchitectureSection({ architecture }: { architecture: OnboardingTour["architecture"] }) {
  return (
    <div>
      <DocMarkdown>{architecture.summary}</DocMarkdown>
      {architecture.diagram && <ArchitectureDiagram diagram={architecture.diagram} />}
    </div>
  );
}
