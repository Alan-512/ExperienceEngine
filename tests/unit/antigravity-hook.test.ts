import { readFileSync, existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { handleAntigravityHookPayload, resolveAntigravityHookEventName } from "../../src/cli/commands/antigravity-hook.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const behaviorLoopMock = () => ({
  lookupHints: vi.fn(async () => ({
    mode: "inject",
    text: "Review the Hook Contract Gate specification.",
    notice: "[ExperienceEngine] Guidance injected."
  })),
  recordToolResult: vi.fn(async () => ({
    status: "recorded"
  })),
  finalizeTask: vi.fn(async () => ({
    status: "finalized"
  }))
});

describe("Antigravity hook command & payload handling", () => {
  it("resolves the hook event from the CLI subcommand argument", () => {
    expect(resolveAntigravityHookEventName(undefined, ["node", "ee", "antigravity-hook", "PreToolUse"])).toBe("PreToolUse");
    expect(resolveAntigravityHookEventName("Stop", ["node", "ee", "antigravity-hook", "PreToolUse"])).toBe("Stop");
  });

  it("resolves CWD from workspacePaths and conversationId from artifactDirectoryPath if missing in payload", async () => {
    const loop = behaviorLoopMock();
    const payload = {
      workspacePaths: ["/workspace/test-repo"],
      artifactDirectoryPath: "/appData/brain/custom-session-uuid",
      prompt: "Fix tests"
    };

    const output = await handleAntigravityHookPayload("PreInvocation", payload, loop as any);

    expect(loop.lookupHints).toHaveBeenCalledWith({
      cwd: "/workspace/test-repo",
      prompt: "Fix tests",
      sessionId: "custom-session-uuid"
    });
    expect(output).toEqual({
      injectSteps: [
        {
          ephemeralMessage: "[ExperienceEngine] Injected prior guidance:\nReview the Hook Contract Gate specification."
        }
      ]
    });
  });

  it("PreToolUse explicitly allows tool execution and does not write tool results to database", async () => {
    const loop = behaviorLoopMock();
    const payload = {
      workspacePaths: ["/workspace/test-repo"],
      artifactDirectoryPath: "/appData/brain/custom-session-uuid",
      toolName: "Bash",
      toolInput: { command: "pnpm test" }
    };

    const output = await handleAntigravityHookPayload("PreToolUse", payload, loop as any);

    expect(loop.recordToolResult).not.toHaveBeenCalled();
    expect(output).toEqual({ decision: "allow" });
  });

  it("PostToolUse records the correct outcome in the behavior database", async () => {
    const loop = behaviorLoopMock();
    const payload = {
      conversationId: "session-123",
      cwd: "/workspace/test-repo",
      toolName: "Bash",
      toolInput: { command: "pnpm test" },
      exitCode: 0,
      status: "success",
      outputSummary: "1034 tests passed"
    };

    const output = await handleAntigravityHookPayload("PostToolUse", payload, loop as any);

    expect(loop.recordToolResult).toHaveBeenCalledWith({
      sessionId: "session-123",
      toolName: "Bash",
      inputSummary: JSON.stringify({ command: "pnpm test" }),
      outputSummary: "1034 tests passed",
      exitCode: 0,
      status: "success"
    });
    expect(output).toEqual({});
  });

  it("PostToolUse maps real Antigravity toolCall payloads", async () => {
    const loop = behaviorLoopMock();
    const payload = {
      conversationId: "session-123",
      workspacePaths: ["/workspace/test-repo"],
      toolCall: {
        name: "run_command",
        args: {
          CommandLine: "pwd",
          Cwd: "/workspace/test-repo",
          toolSummary: "Check current directory"
        }
      },
      error: ""
    };

    const output = await handleAntigravityHookPayload("PostToolUse", payload, loop as any);

    expect(loop.recordToolResult).toHaveBeenCalledWith({
      sessionId: "session-123",
      toolName: "run_command",
      inputSummary: JSON.stringify({
        CommandLine: "pwd",
        Cwd: "/workspace/test-repo",
        toolSummary: "Check current directory"
      }),
      outputSummary: "Check current directory",
      exitCode: undefined,
      status: "success"
    });
    expect(output).toEqual({});
  });

  it("Stop event correctly invokes behavior loop task finalization", async () => {
    const loop = behaviorLoopMock();
    const payload = {
      conversationId: "session-123",
      cwd: "/workspace/test-repo",
      prompt: "Verify build correctness",
      lastMessage: "Finished execution successfully"
    };

    const output = await handleAntigravityHookPayload("Stop", payload, loop as any);

    expect(loop.finalizeTask).toHaveBeenCalledWith({
      sessionId: "session-123",
      cwd: "/workspace/test-repo",
      prompt: "Verify build correctness",
      contextSummary: "Finished execution successfully"
    });
    expect(output).toEqual({});
  });

  it("reads and parses the transcript.jsonl file to resolve the prompt if missing from payload", async () => {
    const loop = behaviorLoopMock();
    const tempDir = mkdtempSync(join(tmpdir(), "experienceengine-antigravity-test-"));
    const transcriptPath = join(tempDir, "transcript.jsonl");

    writeFileSync(
      transcriptPath,
      JSON.stringify({
        type: "USER_INPUT",
        content: "<USER_REQUEST>Run the antigravity adapter test</USER_REQUEST>"
      }) + "\n",
      "utf8"
    );

    const payload = {
      workspacePaths: ["/workspace/test-repo"],
      artifactDirectoryPath: "/appData/brain/0b03efea-7f1d-4aff-84a4-ce954372619b",
      transcriptPath
    };

    await handleAntigravityHookPayload("PreInvocation", payload, loop as any);
    expect(loop.lookupHints).toHaveBeenCalled();
    const callArgs = (loop.lookupHints as any).mock.calls[0][0];
    expect(callArgs.sessionId).toBe("0b03efea-7f1d-4aff-84a4-ce954372619b");
    expect(callArgs.prompt).toContain("antigravity");

    // Clean up
    removeTempDirForTests(tempDir);
  });
});
