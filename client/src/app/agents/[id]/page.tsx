/* /agents/:id — Agent Editor (A2, L03). Thin route entry; the master-detail shell
   lives in _components/AgentsWorkspace. */
"use client";

import { useParams } from "next/navigation";
import { AgentsWorkspace } from "../_components/AgentsWorkspace";

export default function AgentEditorPage() {
  const { id } = useParams<{ id: string }>();
  return <AgentsWorkspace id={id} />;
}
