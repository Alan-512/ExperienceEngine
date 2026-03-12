import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { installClaudeCodeAdapter } from "../../src/install/claude-code-installer.js";
import { inspectClaudeCodeInstall } from "../../src/install/claude-code-doctor.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-claude-doctor-"));
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

describe("Claude Code doctor", () => {
  it("reports installed hooks from project-local settings", () => {
    const homeDir = makeTempDir();
    const projectDir = makeTempDir();

    installClaudeCodeAdapter({ homeDir, projectDir });
    const inspection = inspectClaudeCodeInstall({ homeDir, projectDir });

    expect(inspection.installed).toBe(true);
    expect(inspection.hooksPresent.userPromptSubmit).toBe(true);
    expect(inspection.hooksPresent.preToolUse).toBe(true);
    expect(inspection.hooksPresent.postToolUse).toBe(true);
    expect(inspection.hooksPresent.sessionEnd).toBe(true);
  });
});
