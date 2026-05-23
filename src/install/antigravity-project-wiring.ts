import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveExperienceEnginePaths } from "../config/path-resolver.js";
import { handleAntigravityHookPayload } from "../cli/commands/antigravity-hook.js";
import { resolveExperienceEnginePackageRoot } from "./openclaw-cli.js";

export type AntigravityLifecycleMode = "host_native_hooks_validated" | "mcp_only";

export type AntigravityOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  mcpOnly?: boolean;
};

export type AntigravityProjectWiringReport = {
  cwd: string;
  lifecycleMode: AntigravityLifecycleMode;
  mcpRegistered: boolean;
  hooksRegistered: boolean;
  hookContractSpikePassed: boolean;
  serverName: string;
  serverCommand: string;
};

const getMcpConfigPath = (cwd: string): string => join(cwd, ".mcp.json");
const getHooksConfigPath = (cwd: string): string => join(cwd, ".agents", "hooks.json");
const getHookLauncherPath = (cwd: string): string => join(cwd, ".agents", "experienceengine-antigravity-hook.mjs");

export const runAntigravityHookSpikeVerification = async (): Promise<{ success: boolean; errors: string[] }> => {
  const errors: string[] = [];
  const packageRoot = resolveExperienceEnginePackageRoot();
  const fixturesDir = join(packageRoot, "tests/fixtures/antigravity");

  const mockBehaviorLoop = {
    lookupHints: async (args: any) => {
      if (!args.cwd || !args.prompt || !args.sessionId) {
        errors.push("lookupHints argument validation failed: missing cwd, prompt, or sessionId");
      }
      return { text: "Spike constraint injected.", mode: "inject" };
    },
    recordToolResult: async (args: any) => {
      if (!args.sessionId || !args.toolName || args.status === undefined) {
        errors.push("recordToolResult argument validation failed: missing sessionId, toolName, or status");
      }
      return { status: "recorded" };
    },
    finalizeTask: async (args: any) => {
      if (!args.sessionId || !args.cwd || !args.prompt) {
        errors.push("finalizeTask argument validation failed: missing sessionId, cwd, or prompt");
      }
      return { status: "finalized" };
    }
  };

  let preInvocationPayload: any = {
    conversationId: "spike-test-session",
    workspacePaths: ["/tmp/spike-test-workspace"],
    artifactDirectoryPath: "/tmp/spike-test-workspace/brain/spike-test-session",
    prompt: "Verify hook contract spike compatibility."
  };
  let preToolUsePayload: any = {
    conversationId: "spike-test-session",
    workspacePaths: ["/tmp/spike-test-workspace"],
    artifactDirectoryPath: "/tmp/spike-test-workspace/brain/spike-test-session",
    toolName: "run_command",
    toolInput: { CommandLine: "pnpm test" }
  };
  let postToolUsePayload: any = {
    conversationId: "spike-test-session",
    workspacePaths: ["/tmp/spike-test-workspace"],
    artifactDirectoryPath: "/tmp/spike-test-workspace/brain/spike-test-session",
    toolName: "run_command",
    toolInput: { CommandLine: "pnpm test" },
    exitCode: 0,
    status: "success",
    outputSummary: "All tests green"
  };
  let stopPayload: any = {
    conversationId: "spike-test-session",
    workspacePaths: ["/tmp/spike-test-workspace"],
    artifactDirectoryPath: "/tmp/spike-test-workspace/brain/spike-test-session",
    lastMessage: "Finished spike task verification"
  };

  try {
    const preInvPath = join(fixturesDir, "payload-pre-invocation.json");
    if (existsSync(preInvPath)) {
      preInvocationPayload = JSON.parse(readFileSync(preInvPath, "utf8"));
    }
    const preToolPath = join(fixturesDir, "payload-pre-tool-use.json");
    if (existsSync(preToolPath)) {
      preToolUsePayload = JSON.parse(readFileSync(preToolPath, "utf8"));
    }
    const postToolPath = join(fixturesDir, "payload-post-tool-use.json");
    if (existsSync(postToolPath)) {
      postToolUsePayload = JSON.parse(readFileSync(postToolPath, "utf8"));
    }
    const stopPath = join(fixturesDir, "payload-stop.json");
    if (existsSync(stopPath)) {
      stopPayload = JSON.parse(readFileSync(stopPath, "utf8"));
    }
  } catch (err: any) {
    errors.push(`Failed to read/parse committed fixtures: ${err?.message || err}`);
  }

  const tempTranscriptPath = join(packageRoot, ".agents", `temp-spike-transcript-${Date.now()}.jsonl`);
  try {
    mkdirSync(dirname(tempTranscriptPath), { recursive: true });
    writeFileSync(
      tempTranscriptPath,
      JSON.stringify({
        type: "USER_INPUT",
        content: "<USER_REQUEST>Verify hook contract spike compatibility via transcript.</USER_REQUEST>"
      }) + "\n",
      "utf8"
    );
  } catch (err: any) {
    errors.push(`Failed to write temp transcript for spike: ${err?.message || err}`);
  }

  try {
    const preInvocationResult = await handleAntigravityHookPayload("PreInvocation", preInvocationPayload, mockBehaviorLoop as any);
    if (!preInvocationResult?.injectSteps?.[0]?.ephemeralMessage?.includes("Spike constraint injected.")) {
      errors.push("PreInvocation hook did not return the expected context mutation injection steps.");
    }

    let recordCalled = false;
    const preToolUseResult = await handleAntigravityHookPayload(
      "PreToolUse",
      preToolUsePayload,
      {
        ...mockBehaviorLoop,
        recordToolResult: async () => {
          recordCalled = true;
          return { status: "recorded" };
        }
      } as any
    );
    if (preToolUseResult?.decision !== "allow") {
      errors.push(`PreToolUse hook did not return an explicit allow decision: ${JSON.stringify(preToolUseResult)}`);
    }
    if (recordCalled) {
      errors.push("PreToolUse hook incorrectly recorded tool result, causing telemetry pollution.");
    }

    let postToolUseRecordCalled = false;
    const postToolUseResult = await handleAntigravityHookPayload(
      "PostToolUse",
      postToolUsePayload,
      {
        ...mockBehaviorLoop,
        recordToolResult: async (args: any) => {
          postToolUseRecordCalled = true;
          const expectedSession = postToolUsePayload.conversationId || "0b03efea-7f1d-4aff-84a4-ce954372619b";
          if (args.sessionId !== expectedSession || args.toolName !== "run_command" || args.status !== "success") {
            errors.push(`PostToolUse passed incorrect arguments to recordToolResult: ${JSON.stringify(args)}`);
          }
          return { status: "recorded" };
        }
      } as any
    );
    if (JSON.stringify(postToolUseResult) !== "{}") {
      errors.push("PostToolUse hook did not return an empty JSON object.");
    }
    if (!postToolUseRecordCalled) {
      errors.push("PostToolUse hook failed to record tool result.");
    }

    let stopFinalizeCalled = false;
    const stopResult = await handleAntigravityHookPayload(
      "Stop",
      {
        ...stopPayload,
        transcriptPath: tempTranscriptPath,
        prompt: undefined
      },
      {
        ...mockBehaviorLoop,
        finalizeTask: async (args: any) => {
          stopFinalizeCalled = true;
          const expectedSession = stopPayload.conversationId || "0b03efea-7f1d-4aff-84a4-ce954372619b";
          if (args.sessionId !== expectedSession) {
            errors.push(`Stop passed incorrect sessionId: expected ${expectedSession}, got ${args.sessionId}`);
          }
          if (args.prompt !== "Verify hook contract spike compatibility via transcript.") {
            errors.push(`Stop failed to resolve prompt from transcriptPath: got "${args.prompt}"`);
          }
          return { status: "finalized" };
        }
      } as any
    );
    if (JSON.stringify(stopResult) !== "{}") {
      errors.push("Stop hook did not return an empty JSON object.");
    }
    if (!stopFinalizeCalled) {
      errors.push("Stop hook failed to finalize task.");
    }
  } catch (err: any) {
    errors.push(`Spike verification threw an unexpected exception: ${err?.message || err}`);
  } finally {
    try {
      if (existsSync(tempTranscriptPath)) {
        unlinkSync(tempTranscriptPath);
      }
    } catch {
      // Ignore cleanup error.
    }
  }

  return {
    success: errors.length === 0,
    errors
  };
};

export const inspectAntigravityProjectWiring = (options: AntigravityOptions = {}): AntigravityProjectWiringReport => {
  const cwd = options.cwd ?? process.cwd();
  const packageRoot = resolveExperienceEnginePackageRoot();
  const defaultServerCommand = `node ${join(packageRoot, "dist/cli/index.js").replace(/\\/g, "/")} mcp-server`;
  let serverCommand = defaultServerCommand;
  let mcpRegistered = false;

  const mcpPath = getMcpConfigPath(cwd);
  if (existsSync(mcpPath)) {
    try {
      const mcpConfig = JSON.parse(readFileSync(mcpPath, "utf8"));
      const server = mcpConfig?.mcpServers?.experienceengine;
      if (server && server.type === "stdio" && server.env?.EXPERIENCE_ENGINE_ADAPTER === "antigravity") {
        mcpRegistered = true;
        serverCommand = `${server.command || ""} ${(server.args || []).join(" ")}`.trim();
      }
    } catch {
      // Ignore malformed project config.
    }
  }

  let hooksRegistered = false;
  const hooksPath = getHooksConfigPath(cwd);
  if (existsSync(hooksPath)) {
    try {
      const hooksConfig = JSON.parse(readFileSync(hooksPath, "utf8"));
      const eeHooks = hooksConfig?.experienceengine;
      hooksRegistered = Boolean(
        eeHooks?.PreInvocation?.length > 0
          && eeHooks?.PreToolUse?.length > 0
          && eeHooks?.PostToolUse?.length > 0
          && eeHooks?.Stop?.length > 0
      );
    } catch {
      // Ignore malformed project hooks.
    }
  }

  const mcpOnly = options.mcpOnly !== undefined ? options.mcpOnly : !(mcpRegistered && hooksRegistered);
  const lifecycleMode: AntigravityLifecycleMode = mcpRegistered && hooksRegistered && !mcpOnly
    ? "host_native_hooks_validated"
    : "mcp_only";

  return {
    cwd,
    lifecycleMode,
    mcpRegistered,
    hooksRegistered,
    hookContractSpikePassed: hooksRegistered,
    serverName: "experienceengine",
    serverCommand
  };
};

export const ensureAntigravityProjectWiring = async (options: AntigravityOptions = {}): Promise<AntigravityProjectWiringReport> => {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const paths = resolveExperienceEnginePaths({
    adapter: "antigravity",
    env,
    homeDir: options.homeDir
  });
  const packageRoot = resolveExperienceEnginePackageRoot();

  let mcpOnly = options.mcpOnly !== undefined ? options.mcpOnly : false;
  let hookContractSpikePassed = false;
  if (!mcpOnly) {
    const spike = await runAntigravityHookSpikeVerification();
    if (spike.success) {
      hookContractSpikePassed = true;
    } else {
      mcpOnly = true;
      console.warn("[ExperienceEngine] Antigravity native hook spike verification failed. Falling back to mcp_only mode.");
      for (const err of spike.errors) {
        console.warn(`  - ${err}`);
      }
    }
  }

  const portableCliScript = join(packageRoot, "dist/cli/index.js").replace(/\\/g, "/");
  const serverCommand = "node";
  const serverArgs = [portableCliScript, "mcp-server"];
  const mcpPath = getMcpConfigPath(cwd);
  let mcpConfig: any = {};
  if (existsSync(mcpPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync(mcpPath, "utf8"));
    } catch {
      // Ignore malformed config and recreate the ExperienceEngine entry.
    }
  }

  if (!mcpConfig.mcpServers) {
    mcpConfig.mcpServers = {};
  }
  mcpConfig.mcpServers.experienceengine = {
    type: "stdio",
    command: serverCommand,
    args: serverArgs,
    env: {
      EXPERIENCE_ENGINE_ADAPTER: "antigravity"
    }
  };
  writeFileSync(mcpPath, `${JSON.stringify(mcpConfig, null, 2)}\n`, "utf8");

  let hooksRegistered = false;
  if (!mcpOnly) {
    const hooksPath = getHooksConfigPath(cwd);
    mkdirSync(dirname(hooksPath), { recursive: true });
    const hookLauncherPath = getHookLauncherPath(cwd);
    const launcherCliScript = JSON.stringify(portableCliScript);
    const launcherProductHome = JSON.stringify(paths.productHome.replace(/\\/g, "/"));
    writeFileSync(
      hookLauncherPath,
      [
        'import { spawnSync } from "node:child_process";',
        "",
        "const eventName = process.argv[2] || \"unknown\";",
        "const chunks = [];",
        "for await (const chunk of process.stdin) {",
        "  chunks.push(Buffer.from(chunk));",
        "}",
        "const stdinText = Buffer.concat(chunks).toString(\"utf8\");",
        `const result = spawnSync(process.execPath, [${launcherCliScript}, "antigravity-hook", eventName], {`,
        "  input: stdinText,",
        "  encoding: \"utf8\",",
        "  env: {",
        "    ...process.env,",
        `    EXPERIENCE_ENGINE_HOME: process.env.EXPERIENCE_ENGINE_HOME || ${launcherProductHome}`,
        "  }",
        "});",
        "if (result.stderr) {",
        "  process.stderr.write(result.stderr);",
        "}",
        "process.stdout.write(result.stdout || \"{}\\n\");",
        "process.exit(result.status ?? 0);",
        ""
      ].join("\n"),
      "utf8"
    );

    let hooksConfig: any = {};
    if (existsSync(hooksPath)) {
      try {
        hooksConfig = JSON.parse(readFileSync(hooksPath, "utf8"));
      } catch {
        // Ignore malformed config and recreate the ExperienceEngine hook block.
      }
    }
    hooksConfig.experienceengine = {
      PreInvocation: [
        {
          type: "command",
          command: "node experienceengine-antigravity-hook.mjs PreInvocation",
          timeout: 10
        }
      ],
      PreToolUse: [
        {
          matcher: "*",
          hooks: [
            {
              type: "command",
              command: "node experienceengine-antigravity-hook.mjs PreToolUse",
              timeout: 10
            }
          ]
        }
      ],
      PostToolUse: [
        {
          matcher: "*",
          hooks: [
            {
              type: "command",
              command: "node experienceengine-antigravity-hook.mjs PostToolUse",
              timeout: 10
            }
          ]
        }
      ],
      Stop: [
        {
          type: "command",
          command: "node experienceengine-antigravity-hook.mjs Stop",
          timeout: 10
        }
      ]
    };
    writeFileSync(hooksPath, `${JSON.stringify(hooksConfig, null, 2)}\n`, "utf8");
    hooksRegistered = true;
  }

  return {
    cwd,
    lifecycleMode: mcpOnly ? "mcp_only" : "host_native_hooks_validated",
    mcpRegistered: true,
    hooksRegistered,
    hookContractSpikePassed,
    serverName: "experienceengine",
    serverCommand: `${serverCommand} ${serverArgs.join(" ")}`
  };
};
