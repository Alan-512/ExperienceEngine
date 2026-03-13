import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { installClaudeCodeAdapter } from "../../src/install/claude-code-installer.js";
import { inspectClaudeCodeInstall } from "../../src/install/claude-code-doctor.js";
import { readCurrentPackageVersion } from "../../src/version/package-version.js";

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
  const currentVersion = readCurrentPackageVersion();

  it("reports installed hooks from project-local settings", () => {
    const homeDir = makeTempDir();
    const projectDir = makeTempDir();

    installClaudeCodeAdapter({
      homeDir,
      projectDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "claude mcp get experienceengine") {
          return `experienceengine:
  Scope: Project config (shared via .mcp.json)
  Status: ✓ Connected
  Type: stdio
  Command: node
  Args: --no-warnings /tmp/experienceengine/dist/cli/index.js mcp-server
  Environment:
    EXPERIENCE_ENGINE_HOME=${join(homeDir, ".experienceengine")}

To remove this server, run: claude mcp remove "experienceengine" -s project`;
        }
        return "";
      }
    });
    const inspection = inspectClaudeCodeInstall({
      homeDir,
      projectDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "claude mcp get experienceengine") {
          return `experienceengine:
  Scope: Project config (shared via .mcp.json)
  Status: ✓ Connected
  Type: stdio
  Command: node
  Args: --no-warnings /tmp/experienceengine/dist/cli/index.js mcp-server
  Environment:
    EXPERIENCE_ENGINE_HOME=${join(homeDir, ".experienceengine")}

To remove this server, run: claude mcp remove "experienceengine" -s project`;
        }
        return "";
      }
    });

    expect(inspection.installed).toBe(true);
    expect(inspection.versionStatus.recordedVersion).toBe(currentVersion);
    expect(inspection.versionStatus.state).toBe("current");
    expect(inspection.hooksPresent.userPromptSubmit).toBe(true);
    expect(inspection.hooksPresent.preToolUse).toBe(true);
    expect(inspection.hooksPresent.postToolUse).toBe(true);
    expect(inspection.hooksPresent.postToolUseFailure).toBe(true);
    expect(inspection.hooksPresent.sessionEnd).toBe(true);
    expect(inspection.hostWiring.wired).toBe(true);
    expect(inspection.hostWiring.transport).toBe("stdio");
    expect(inspection.hostWiring.scope).toContain("Project config");
  });
});
