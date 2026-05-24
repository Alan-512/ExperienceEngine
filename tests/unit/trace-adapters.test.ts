import { describe, expect, it } from "vitest";
import {
  normalizeClaudeEvent,
  normalizeCodexEvent,
  normalizeAntigravityEvent,
  normalizeOpenClawEvent
} from "../../src/adapters/host-normalizers.js";

describe("Host Trace Normalizers", () => {
  describe("Claude Code Normalizer (Task 4.1)", () => {
    it("normalizes prompts, tool calls, successes, failures, file changes, and completions", () => {
      // 1. Prompt Event
      const promptEv = normalizeClaudeEvent({
        eventName: "user_submit",
        promptText: "Please analyze package.json and edit sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12"
      });
      expect(promptEv.event_type).toBe("prompt");
      expect(promptEv.payload.prompt).toBe("Please analyze package.json and edit [REDACTED]");
      expect(promptEv.source.host).toBe("claude-code");

      // 2. Tool Call Event
      const callEv = normalizeClaudeEvent({
        eventName: "beforetooluse",
        toolCallId: "call_1",
        toolName: "read_file",
        toolInputSummary: "package.json"
      });
      expect(callEv.event_type).toBe("tool_call");
      expect(callEv.payload.tool_call_id).toBe("call_1");
      expect(callEv.payload.tool_name).toBe("read_file");
      expect(callEv.payload.arguments).toBe("package.json");

      // 3. Tool Success Event
      const successEv = normalizeClaudeEvent({
        eventName: "posttoolusesuccess",
        toolCallId: "call_1",
        toolOutputSummary: "All clean!"
      });
      expect(successEv.event_type).toBe("tool_result");
      expect(successEv.payload.tool_call_id).toBe("call_1");
      expect(successEv.payload.status).toBe("success");
      expect(successEv.payload.result).toBe("All clean!");

      // 4. Tool Failure Event
      const failEv = normalizeClaudeEvent({
        eventName: "posttoolusefailure",
        toolCallId: "call_1",
        toolOutputSummary: "Command failed"
      });
      expect(failEv.event_type).toBe("tool_failure");
      expect(failEv.payload.tool_call_id).toBe("call_1");
      expect(failEv.payload.status).toBe("failure");
      expect(failEv.payload.error).toBe("Command failed");
      expect(failEv.payload.exit_code).toBe(1);

      // 5. File Change Event
      const fileEv = normalizeClaudeEvent({
        eventName: "file_written",
        filePath: "src/types/domain.ts",
        action: "write"
      });
      expect(fileEv.event_type).toBe("file_change");
      expect(fileEv.payload.file_path).toBe("src/types/domain.ts");
      expect(fileEv.payload.action).toBe("write");

      // 6. Stop / Completion Event
      const stopEv = normalizeClaudeEvent({
        eventName: "session_end",
        reason: "completed"
      });
      expect(stopEv.event_type).toBe("task_completion");
      expect(stopEv.payload.reason).toBe("completed");
    });
  });

  describe("Codex Normalizer (Task 4.2 & 4.5)", () => {
    it("normalizes prompts, tools, subagents, permission checks, compaction, and marks transcripts as unstable", () => {
      // 1. Subagent lifecycle
      const subagentEv = normalizeCodexEvent({
        type: "subagent_lifecycle",
        subagentId: "subagent_auth",
        action: "invoke"
      });
      expect(subagentEv.event_type).toBe("subagent_lifecycle");
      expect(subagentEv.payload.subagent_id).toBe("subagent_auth");
      expect(subagentEv.payload.action).toBe("invoke");

      // 2. Permission request
      const permEv = normalizeCodexEvent({
        type: "permission_request",
        permission: "read_file",
        action: "grant"
      });
      expect(permEv.event_type).toBe("permission_request");
      expect(permEv.payload.permission).toBe("read_file");
      expect(permEv.payload.action).toBe("grant");

      // 3. Compaction
      const compactEv = normalizeCodexEvent({
        type: "compaction",
        beforeSize: 2000,
        afterSize: 1000
      });
      expect(compactEv.event_type).toBe("compaction");
      expect(compactEv.payload.before_size).toBe(2000);
      expect(compactEv.payload.after_size).toBe(1000);

      // 4. Transcript path instability (Task 4.5)
      const transcriptEv = normalizeCodexEvent({
        type: "prompt",
        prompt: "Hello",
        transcriptPath: "/workspace/logs/transcript.jsonl"
      });
      expect(transcriptEv.source.is_unstable).toBe(true);
      expect(transcriptEv.payload.transcript_path).toBe("/workspace/logs/transcript.jsonl");
    });
  });

  describe("Antigravity Normalizer (Task 4.3)", () => {
    it("normalizes invocation, step index, stop, and marks artifacts as file changes", () => {
      // 1. Invocation Prompt
      const invokeEv = normalizeAntigravityEvent({
        name: "invocation",
        prompt: "Fix database schema"
      });
      expect(invokeEv.event_type).toBe("prompt");
      expect(invokeEv.payload.prompt).toBe("Fix database schema");

      // 2. Step tool call
      const stepCallEv = normalizeAntigravityEvent({
        name: "tool_call",
        stepIndex: 3,
        toolName: "replace_file_content",
        arguments: "Update users table"
      });
      expect(stepCallEv.event_type).toBe("tool_call");
      expect(stepCallEv.payload.tool_call_id).toBe("call_3");
      expect(stepCallEv.payload.step_index).toBe(3);
      expect(stepCallEv.payload.arguments).toBe("Update users table");

      // 3. Step tool result
      const stepResultEv = normalizeAntigravityEvent({
        name: "tool_result",
        stepIndex: 3,
        status: "success",
        result: "Updated successfully"
      });
      expect(stepResultEv.event_type).toBe("tool_result");
      expect(stepResultEv.payload.tool_call_id).toBe("call_3");
      expect(stepResultEv.payload.status).toBe("success");
      expect(stepResultEv.payload.result).toBe("Updated successfully");

      // 4. Artifact Path (Task 4.3 & 4.5)
      const artifactEv = normalizeAntigravityEvent({
        name: "tool_result",
        artifactPath: "d:/project/ExperienceEngine/out/walkthrough.md"
      });
      expect(artifactEv.event_type).toBe("file_change");
      expect(artifactEv.payload.file_path).toBe("d:/project/ExperienceEngine/out/walkthrough.md");
      expect(artifactEv.payload.action).toBe("write");
    });
  });

  describe("OpenClaw Normalizer (Task 4.4)", () => {
    it("normalizes messages, tool results, and stop events", () => {
      // 1. Message Prompt
      const msgEv = normalizeOpenClawEvent({
        event: "message",
        message: "Check openclaw status"
      });
      expect(msgEv.event_type).toBe("prompt");
      expect(msgEv.payload.prompt).toBe("Check openclaw status");

      // 2. Tool result
      const resultEv = normalizeOpenClawEvent({
        event: "tool_result",
        toolCallId: "claw_call_1",
        toolName: "run_command",
        result: "Successful output"
      });
      expect(resultEv.event_type).toBe("tool_result");
      expect(resultEv.payload.tool_call_id).toBe("claw_call_1");
      expect(resultEv.payload.status).toBe("success");
      expect(resultEv.payload.result).toBe("Successful output");

      // 3. Stop task
      const stopEv = normalizeOpenClawEvent({
        event: "finalize_task",
        reason: "finished"
      });
      expect(stopEv.event_type).toBe("task_completion");
      expect(stopEv.payload.reason).toBe("finished");
    });
  });

  describe("Audit Enhancements & Edge Cases (Task 4 Validation)", () => {
    it("correctly handles str_replace_editor as file change and maps verification tools", () => {
      // 1. Claude str_replace_editor
      const claudeEdit = normalizeClaudeEvent({
        eventName: "posttoolusesuccess",
        toolName: "str_replace_editor",
        toolInputSummary: "src/index.ts",
        toolOutputSummary: "Replaced line 12"
      });
      expect(claudeEdit.event_type).toBe("file_change");
      expect(claudeEdit.payload.file_path).toBe("src/index.ts");
      expect(claudeEdit.payload.status).toBe("success");

      // 2. Verification mapping for Vitest on Claude Code
      const verifyEv = normalizeClaudeEvent({
        eventName: "posttoolusesuccess",
        toolName: "vitest",
        toolInputSummary: "run tests",
        toolOutputSummary: "All 5 tests passed!"
      });
      expect(verifyEv.event_type).toBe("verification");
      expect(verifyEv.payload.status).toBe("success");

      // 3. Deterministic ID validation
      expect(verifyEv.id).toMatch(/^claude_ev_[a-f0-9]{12}$/);

      // 4. Robust exit code matching and secrets redaction on error
      const failedVerifyEv = normalizeClaudeEvent({
        eventName: "posttoolusefailure",
        toolName: "eslint",
        toolOutputSummary: "Bearer sk-ant-1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        exitCode: 127
      });
      expect(failedVerifyEv.event_type).toBe("verification");
      expect(failedVerifyEv.payload.status).toBe("failure");
      expect(failedVerifyEv.payload.exit_code).toBe(127);
      expect(failedVerifyEv.payload.error).toBe("Bearer [REDACTED]");

      // 5. Codex exit_code (snake_case) support in tool failure
      const codexFail = normalizeCodexEvent({
        type: "tool_result",
        toolName: "run_command",
        error: "Bearer sk-ant-12345678",
        exit_code: 101
      });
      expect(codexFail.event_type).toBe("tool_failure");
      expect(codexFail.payload.exit_code).toBe(101);
      expect(codexFail.payload.error).toBe("[REDACTED]");

      // 6. Object-based arguments/error redaction resilience (High Severity Audit Fix)
      const codexObjArgs = normalizeCodexEvent({
        type: "tool_call",
        toolName: "run_command",
        arguments: { command: "curl -H 'Authorization: Bearer sk-ant-1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' https://api.anthropic.com" }
      });
      expect(codexObjArgs.event_type).toBe("tool_call");
      expect(codexObjArgs.payload.arguments).toContain("[REDACTED]");
      expect(codexObjArgs.payload.arguments).not.toContain("sk-ant-12345");

      // 7. Circular reference safety test (High Severity Audit Fix)
      const circularObj: any = { message: "Circular trace" };
      circularObj.self = circularObj;
      const codexCircular = normalizeCodexEvent({
        type: "tool_result",
        toolName: "run_command",
        error: circularObj
      });
      expect(codexCircular.event_type).toBe("tool_failure");
      expect(codexCircular.payload.error).toBe("[object Object]");

      // 8. BigInt safety test (High Severity Audit Fix)
      const codexBigInt = normalizeCodexEvent({
        type: "tool_call",
        toolName: "run_command",
        arguments: { size: 1024n, bearer: "Bearer sk-ant-12345678" }
      });
      expect(codexBigInt.event_type).toBe("tool_call");
      expect(codexBigInt.payload.arguments).toContain("[REDACTED]");

      // 9. Error object properties preservation test (High Severity Audit Fix)
      const testError = new Error("Connection failed");
      testError.stack = "Error: Connection failed at run_command line 42";
      const claudeError = normalizeClaudeEvent({
        eventName: "posttoolusefailure",
        toolName: "eslint",
        toolOutputSummary: testError
      });
      expect(claudeError.event_type).toBe("verification");
      expect(claudeError.payload.error).toContain("Error: Connection failed");
      expect(claudeError.payload.error).toContain("at run_command line 42");
    });
  });
});
