import { SEV } from "@devdigest/ui";
import type { AgentColumnFindingView, AgentColumnView } from "@/lib/types";

/** `file:line` or `file:start-end` when the range spans more than one line. */
export function lineLabel(f: AgentColumnFindingView): string {
  return f.start_line === f.end_line ? `${f.file}:${f.start_line}` : `${f.file}:${f.start_line}-${f.end_line}`;
}

export function severityColor(sev: AgentColumnFindingView["severity"]): string {
  return SEV[sev]?.c ?? "var(--text-muted)";
}

/** Score ring color / status chip tint by column status. */
export function statusColor(status: AgentColumnView["status"]): string {
  if (status === "failed") return "var(--crit)";
  if (status === "cancelled") return "var(--text-muted)";
  if (status === "queued" || status === "running") return "var(--accent)";
  return "var(--text-muted)";
}
