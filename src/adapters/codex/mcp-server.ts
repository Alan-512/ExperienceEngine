import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  createSharedMcpServer,
  createSharedInteractionSurface,
  type SharedMcpServerOptions
} from "../shared-mcp/server.js";
import {
  createSharedBehaviorLoop,
  type SharedLookupArgs
} from "../shared-mcp/behavior-loop.js";

export { createCodexBehaviorLoop } from "./behavior-loop.js";

export type CodexServerOptions = SharedMcpServerOptions;

export const createCodexInteractionSurface = (options: CodexServerOptions = {}) => {
  return createSharedInteractionSurface("codex", options);
};

export const lookupCodexExperienceHints = async (
  args: SharedLookupArgs,
  options: CodexServerOptions = {}
) => {
  const behaviorLoop = createSharedBehaviorLoop("codex", options);
  return behaviorLoop.lookupHints(args);
};

export const createCodexMcpServer = (options: CodexServerOptions = {}) => {
  return createSharedMcpServer("codex", options);
};

export const runCodexMcpServer = async (): Promise<void> => {
  const server = createCodexMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
