import { runMcpServerCommand } from "./mcp-server.js";

export const runCodexMcpServerCommand = async (): Promise<void> => {
  await runMcpServerCommand();
};
