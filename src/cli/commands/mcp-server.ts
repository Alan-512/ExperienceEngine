import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSharedMcpServer } from "../../adapters/shared-mcp/server.js";
import { touchClaudeMarketplaceHeartbeat } from "../../install/claude-marketplace-state.js";
import type { ExperienceAdapter } from "../../interaction/operational-service.js";

export const runMcpServerCommand = async (): Promise<void> => {
  if (process.env.EXPERIENCE_ENGINE_CLAUDE_HOOK_SOURCE === "marketplace") {
    touchClaudeMarketplaceHeartbeat(process.env.EXPERIENCE_ENGINE_HOME, "mcp");
  }

  let adapter = (process.env.EXPERIENCE_ENGINE_ADAPTER || "codex") as ExperienceAdapter;
  const adapterFlagIndex = process.argv.indexOf("--adapter");
  if (adapterFlagIndex >= 0 && process.argv[adapterFlagIndex + 1]) {
    adapter = process.argv[adapterFlagIndex + 1] as ExperienceAdapter;
  }

  const server = createSharedMcpServer(adapter);
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
