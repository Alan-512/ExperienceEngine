import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeClaudeTranscript, runClaudePrintValidation } from "../../src/maintenance/claude-validate-print.js";

describe("claude print validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("finds the target tool, tool result, and final assistant text from the latest transcript", async () => {
    const root = mkdtempSync(join(tmpdir(), "ee-claude-validate-"));
    const transcriptDir = join(root, ".claude", "projects", "-repo");
    mkdirSync(transcriptDir, { recursive: true });
    const transcriptPath = join(transcriptDir, "session-a.jsonl");

    writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                name: "mcp__experienceengine__experienceengine_get_capabilities",
                id: "call_1",
                input: {}
              }
            ]
          }
        }),
        JSON.stringify({
          type: "user",
          message: {
            content: [
              {
                type: "tool_result",
                tool_use_id: "call_1",
                content: "{\"directTools\":[\"experienceengine_get_capabilities\"]}"
              }
            ]
          }
        }),
        JSON.stringify({
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Capabilities loaded successfully." }]
          }
        })
      ].join("\n"),
      "utf8"
    );

    const result = analyzeClaudeTranscript(transcriptPath, "mcp__experienceengine__experienceengine_get_capabilities");

    expect(result.transcriptPath).toBe(transcriptPath);
    expect(result.toolSeen).toBe(true);
    expect(result.toolResultSeen).toBe(true);
    expect(result.assistantText).toBe("Capabilities loaded successfully.");
    expect(result.usedTranscriptConclusion).toBe(true);
  });

  it("runs claude print mode with bypass permissions and falls back to transcript when stdout is empty", async () => {
    const root = mkdtempSync(join(tmpdir(), "ee-claude-validate-run-"));
    const cwd = join(root, "repo");
    mkdirSync(cwd, { recursive: true });
    const transcriptDir = join(
      root,
      ".claude",
      "projects",
      cwd.replace(/[<>:"/\\|?*]+/g, "-")
    );
    mkdirSync(transcriptDir, { recursive: true });
    const transcriptPath = join(transcriptDir, "session-b.jsonl");

    writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                name: "mcp__experienceengine__experienceengine_get_capabilities",
                id: "call_caps",
                input: {}
              }
            ]
          }
        }),
        JSON.stringify({
          type: "user",
          message: {
            content: [
              {
                type: "tool_result",
                tool_use_id: "call_caps",
                content: "{\"directTools\":[\"experienceengine_get_capabilities\"]}"
              }
            ]
          }
        }),
        JSON.stringify({
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Capabilities loaded." }]
          }
        })
      ].join("\n"),
      "utf8"
    );

    vi.spyOn(process, "cwd").mockReturnValue(cwd);
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const spawnSync = vi.fn(
      () =>
        ({
          pid: 123,
          output: ["", "", ""],
          stdout: "",
          stderr: "",
          status: 0,
          signal: null
        }) as never
    );

    const report = await runClaudePrintValidation({
      prompt: "Load capabilities.",
      targetToolName: "mcp__experienceengine__experienceengine_get_capabilities",
      homeDir: root,
      spawnSync,
      mcpServerCheck: async () => ({
        mcpServerToolAvailable: true,
        mcpServerToolNames: ["experienceengine_get_capabilities"],
        mcpServerError: null
      })
    });

    expect(spawnSync).toHaveBeenCalledWith(
      "claude",
      ["-p", "--permission-mode", "bypassPermissions", "Load capabilities."],
      expect.objectContaining({ cwd, encoding: "utf8" })
    );
    expect(report.exitCode).toBe(0);
    expect(report.stdout).toBe("");
    expect(report.transcriptPath).toBe(transcriptPath);
    expect(report.toolSeen).toBe(true);
    expect(report.toolResultSeen).toBe(true);
    expect(report.assistantText).toBe("Capabilities loaded.");
    expect(report.usedTranscriptConclusion).toBe(true);
    expect(report.mcpServerToolAvailable).toBe(true);
    expect(report.mcpServerToolNames).toContain("experienceengine_get_capabilities");
  });
});
