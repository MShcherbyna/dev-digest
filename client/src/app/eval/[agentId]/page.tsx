/* /eval/:agentId — per-agent Eval Dashboard. Thin entry; the view lives in
   _components/AgentEvalDashboardView. */
"use client";

import { useParams } from "next/navigation";
import { AgentEvalDashboardView } from "../_components/AgentEvalDashboardView";

export default function AgentEvalDashboardPage() {
  const { agentId } = useParams<{ agentId: string }>();
  return <AgentEvalDashboardView agentId={agentId} />;
}
