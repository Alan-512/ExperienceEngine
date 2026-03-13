import { runCodexMcpServer } from "../../adapters/codex/mcp-server.js";

export const runMcpServerCommand = async (): Promise<void> => {
  await runCodexMcpServer();
};
