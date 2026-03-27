import { runCodexMcpServer } from "../../adapters/codex/mcp-server.js";
import { touchClaudeMarketplaceHeartbeat } from "../../install/claude-marketplace-state.js";

export const runMcpServerCommand = async (): Promise<void> => {
  if (process.env.EXPERIENCE_ENGINE_CLAUDE_HOOK_SOURCE === "marketplace") {
    touchClaudeMarketplaceHeartbeat(process.env.EXPERIENCE_ENGINE_HOME, "mcp");
  }
  await runCodexMcpServer();
};
