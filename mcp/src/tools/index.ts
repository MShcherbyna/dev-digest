import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guarded, type ToolDeps } from './deps.js';
import { registerGetBlastRadius } from './get-blast-radius.js';
import { registerGetConventions } from './get-conventions.js';
import { registerGetFindings } from './get-findings.js';
import { registerListAgents } from './list-agents.js';
import { registerRunAgentOnPr } from './run-agent-on-pr.js';

/** The single tool registry. The tool set is closed: exactly these five. */
export function registerTools(server: McpServer, deps: ToolDeps): void {
  registerListAgents(server, deps);
  registerRunAgentOnPr(server, deps);
  registerGetFindings(server, deps);
  registerGetConventions(server, deps);
  registerGetBlastRadius(server, deps);
}
