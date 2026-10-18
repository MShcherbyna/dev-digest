"use client";

import { useParams } from "next/navigation";
import { MultiAgentRunView } from "./_components/MultiAgentRunView";

/* Route: /multi-agent-review/:runId. Thin entry — see _components/MultiAgentRunView. */
export default function MultiAgentRunPage() {
  const { runId } = useParams<{ runId: string }>();
  return <MultiAgentRunView runId={runId} />;
}
