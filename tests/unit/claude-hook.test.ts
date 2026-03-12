import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { persistClaudeHookCapture } from "../../src/cli/commands/claude-hook.js";
import { persistClaudeNormalizedEvent } from "../../src/adapters/claude-code/event-store.js";
import { normalizeClaudeHookPayload } from "../../src/adapters/claude-code/hook-normalizer.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-claude-hook-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("Claude hook capture", () => {
  it("persists hook payload JSON into the Claude adapter capture directory", () => {
    const homeDir = makeTempDir();
    const capturePath = persistClaudeHookCapture(
      JSON.stringify({
        session_id: "session-123",
        hook_event_name: "PostToolUse",
        tool_name: "Bash"
      }),
      { homeDir }
    );

    expect(capturePath).toBeTruthy();
    const captureDir = join(homeDir, ".experienceengine", "adapters", "claude-code", "captures");
    const files = readdirSync(captureDir);
    expect(files).toHaveLength(1);

    const capture = JSON.parse(readFileSync(join(captureDir, files[0]), "utf8")) as {
      payload?: { session_id?: string; hook_event_name?: string; tool_name?: string };
      raw?: string;
    };
    expect(capture.payload?.session_id).toBe("session-123");
    expect(capture.payload?.hook_event_name).toBe("PostToolUse");
    expect(capture.payload?.tool_name).toBe("Bash");
    expect(capture.raw).toContain("session-123");
  });

  it("appends normalized Claude events under the adapter state directory", () => {
    const homeDir = makeTempDir();
    const filePath = persistClaudeNormalizedEvent(
      normalizeClaudeHookPayload({
        hook_event_name: "SessionEnd",
        session_id: "session-789",
        message: "done"
      }),
      { homeDir }
    );

    const lines = readFileSync(filePath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);

    const event = JSON.parse(lines[0]) as {
      adapter: string;
      eventName: string;
      sessionId?: string;
      promptText?: string;
    };
    expect(event.adapter).toBe("claude-code");
    expect(event.eventName).toBe("SessionEnd");
    expect(event.sessionId).toBe("session-789");
    expect(event.promptText).toBe("done");
  });
});
