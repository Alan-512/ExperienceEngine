import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSharedBehaviorLoop } from "../../adapters/shared-mcp/behavior-loop.js";
import { resolveExperienceEnginePaths, resolveProductStateDir } from "../../config/path-resolver.js";
import { hashText } from "../../utils/hashing.js";

const FINALIZE_DEDUP_TTL_MS = 2 * 60 * 1000;

const getFinalizeDedupTtlMs = (): number => {
  const raw = process.env.EXPERIENCE_ENGINE_ANTIGRAVITY_FINALIZE_DEDUP_TTL_MS;
  if (!raw) {
    return FINALIZE_DEDUP_TTL_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : FINALIZE_DEDUP_TTL_MS;
};

const acquireFinalizeDedupMarker = (input: {
  sessionId: string;
  cwd: string;
  prompt: string;
  contextSummary?: string;
}): { acquired: boolean; markerPath?: string } => {
  const paths = resolveExperienceEnginePaths({ adapter: "antigravity" });
  const markerDir = join(resolveProductStateDir(paths), "finalize-dedupe");
  const markerName = `${hashText(JSON.stringify(input)).slice(0, 32)}.lock`;
  const markerPath = join(markerDir, markerName);
  const ttlMs = getFinalizeDedupTtlMs();

  try {
    if (existsSync(markerPath)) {
      const ageMs = Date.now() - statSync(markerPath).mtimeMs;
      if (ageMs <= ttlMs) {
        return { acquired: false, markerPath };
      }
      rmSync(markerPath, { force: true });
    }

    mkdirSync(markerDir, { recursive: true });
    writeFileSync(markerPath, new Date().toISOString(), { flag: "wx" });
    return { acquired: true, markerPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return { acquired: false, markerPath };
    }
    return { acquired: true };
  }
};

export const handleAntigravityHookPayload = async (
  eventName: string,
  payload: any,
  behaviorLoop = createSharedBehaviorLoop("antigravity")
): Promise<any> => {
  // 1. Resolve conversation ID (session ID)
  let conversationId =
    process.env.CONVERSATION_ID ||
    process.env.AGENT_CONVERSATION_ID ||
    payload.conversationId;

  // Fallback: extract from artifactDirectoryPath if present and conversationId is missing or global
  if ((!conversationId || conversationId === "global") && payload.artifactDirectoryPath) {
    const parts = payload.artifactDirectoryPath.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length > 0) {
      conversationId = parts[parts.length - 1];
    }
  }

  // Final fallback to prevent empty sessionId
  if (!conversationId) {
    conversationId = "global";
  }

  // 2. Resolve CWD
  const cwd =
    payload.cwd ||
    (payload.workspacePaths && payload.workspacePaths.length > 0 ? payload.workspacePaths[0] : null) ||
    process.env.EXPERIENCE_ENGINE_PROJECT_CWD ||
    process.cwd();

  // 3. Resolve Prompt
  let prompt = payload.prompt || payload.userMessage || payload.text || "";

  // Antigravity CLI hook payloads can surface CLI flags in prompt fields. Prefer
  // transcript USER_INPUT when the direct prompt is absent or clearly flag-like.
  const isCliFlag = (p: string) => /^-{1,2}[\w-]+$/.test(p);

  if ((!prompt || isCliFlag(prompt)) && payload.transcriptPath && existsSync(payload.transcriptPath)) {
    try {
      const content = readFileSync(payload.transcriptPath, "utf8");
      const lines = content.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const step = JSON.parse(line);
          if (step.type === "USER_INPUT" && step.content) {
            let userContent = step.content;
            const match = userContent.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
            if (match) {
              userContent = match[1].trim();
            }
            prompt = userContent;
            break;
          }
        } catch {
          // Ignore parse errors on individual lines
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  if ((!prompt || isCliFlag(prompt)) && process.env.EXPERIENCE_ENGINE_PROMPT) {
    prompt = process.env.EXPERIENCE_ENGINE_PROMPT;
  }

  if (eventName === "PreInvocation") {
    const lookup = await behaviorLoop.lookupHints({
      cwd,
      prompt,
      sessionId: conversationId
    });

    if (lookup.text) {
      return {
        injectSteps: [
          {
            ephemeralMessage: `[ExperienceEngine] Injected prior guidance:\n${lookup.text}`
          }
        ]
      };
    } else {
      return {};
    }
  } else if (eventName === "PreToolUse") {
    return { decision: "allow" };
  } else if (eventName === "PostToolUse") {
    const toolCall = payload.toolCall || {};
    const toolArgs = toolCall.args || payload.toolInput || payload.tool_input;
    const status = payload.status || (payload.error ? "failure" : payload.exitCode === 0 ? "success" : payload.exitCode !== undefined ? "failure" : "success");
    await behaviorLoop.recordToolResult({
      sessionId: conversationId,
      toolName: payload.toolName || payload.tool_name || toolCall.name || "unknown",
      inputSummary: payload.inputSummary || (toolArgs ? JSON.stringify(toolArgs) : undefined),
      outputSummary:
        payload.outputSummary ||
        payload.error ||
        toolArgs?.toolSummary ||
        toolArgs?.toolAction ||
        (payload.toolResponse || payload.tool_response ? JSON.stringify(payload.toolResponse || payload.tool_response) : undefined),
      exitCode: payload.exitCode !== undefined ? payload.exitCode : (payload.exit_code !== undefined ? payload.exit_code : undefined),
      status: status as "success" | "failure" | "unknown"
    });
    return {};
  } else if (eventName === "Stop") {
    const contextSummary = payload.lastMessage || payload.contextSummary || payload.last_assistant_message || undefined;
    const dedupMarker = acquireFinalizeDedupMarker({
      sessionId: conversationId,
      cwd,
      prompt,
      contextSummary
    });
    if (!dedupMarker.acquired) {
      return {};
    }

    try {
      await behaviorLoop.finalizeTask({
        sessionId: conversationId,
        cwd,
        prompt,
        contextSummary
      });
    } catch (error) {
      if (dedupMarker.markerPath) {
        rmSync(dedupMarker.markerPath, { force: true });
      }
      throw error;
    }
    return {};
  }

  return {};
};

export const resolveAntigravityHookEventName = (eventNameArg?: string, argv = process.argv): string =>
  eventNameArg || argv[3] || argv[2] || "unknown";

export const runAntigravityHookCommand = async (eventNameArg?: string): Promise<void> => {
  const eventName = resolveAntigravityHookEventName(eventNameArg);

  // Read stdin
  let inputData = "";
  try {
    inputData = readFileSync(0, "utf-8");
  } catch (err) {
    // Ignore read errors
  }

  let payload: any = {};
  try {
    payload = JSON.parse(inputData);
  } catch {
    // Stdin might not be JSON
  }

  const result = await handleAntigravityHookPayload(eventName, payload);
  console.log(JSON.stringify(result));
};
