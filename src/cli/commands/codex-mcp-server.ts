import { runCodexMcpServer } from "../../adapters/codex/mcp-server.js";

export const runCodexMcpServerCommand = async (): Promise<void> => {
  await runCodexMcpServer();
};
