import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "../../config/load-config.js";
import { resolveExperienceEnginePaths } from "../../config/path-resolver.js";
import { ExperienceRuntimeService } from "../../runtime/service.js";

type CodexLookupArgs = {
  cwd?: string;
  prompt: string;
  sessionId?: string;
};

type CodexServerOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

export const lookupCodexExperienceHints = async (
  args: CodexLookupArgs,
  options: CodexServerOptions = {}
) => {
  const paths = resolveExperienceEnginePaths({
    adapter: "codex",
    env: options.env ?? process.env,
    homeDir: options.homeDir
  });
  const runtime = new ExperienceRuntimeService(
    loadConfig({
      dataDir: paths.dataDir,
      sqlitePath: paths.sqlitePath,
      captureDir: paths.captureDir
    })
  );

  const result = await runtime.beforePromptBuild({
    sessionId: args.sessionId,
    cwd: args.cwd,
    userMessage: args.prompt,
    taskSummary: args.prompt
  });

  return {
    mode: result.mode,
    text: result.text,
    injectedNodeIds: result.input.injected_node_ids
  };
};

export const createCodexMcpServer = (options: CodexServerOptions = {}) => {
  const server = new McpServer({
    name: "experienceengine",
    version: "0.1.0"
  });

  server.registerTool(
    "experienceengine_lookup_hints",
    {
      title: "ExperienceEngine Lookup Hints",
      description:
        "Look up concise prior experience hints for the current coding task without assuming host lifecycle hooks.",
      inputSchema: z.object({
        cwd: z.string().optional(),
        prompt: z.string().min(1),
        sessionId: z.string().optional()
      })
    },
    async ({ cwd, prompt, sessionId }) => {
      const result = await lookupCodexExperienceHints({ cwd, prompt, sessionId }, options);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }
  );

  return server;
};

export const runCodexMcpServer = async (): Promise<void> => {
  const server = createCodexMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
