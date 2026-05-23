import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureAntigravityProjectWiring,
  inspectAntigravityProjectWiring
} from "../../src/install/antigravity-project-wiring.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-antigravity-wiring-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      removeTempDirForTests(dir);
    }
  }
});

describe("Antigravity project wiring", () => {
  it("ensures MCP and lifecycle hook wiring in a project", async () => {
    const tempDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(tempDir, ".experienceengine") };

    const report = await ensureAntigravityProjectWiring({
      cwd: tempDir,
      env,
      homeDir: tempDir
    });

    expect(report.cwd).toBe(tempDir);
    expect(report.mcpRegistered).toBe(true);
    expect(report.hooksRegistered).toBe(true);
    expect(report.lifecycleMode).toBe("host_native_hooks_validated");
    expect(existsSync(join(tempDir, ".mcp.json"))).toBe(true);
    expect(existsSync(join(tempDir, ".agents", "hooks.json"))).toBe(true);
    expect(existsSync(join(tempDir, ".agents", "experienceengine-antigravity-hook.mjs"))).toBe(true);

    const hooks = JSON.parse(readFileSync(join(tempDir, ".agents", "hooks.json"), "utf8"));
    expect(hooks.experienceengine.PreInvocation[0].command).toBe("node experienceengine-antigravity-hook.mjs PreInvocation");
    expect(hooks.experienceengine.PreToolUse[0].hooks[0].command).toBe("node experienceengine-antigravity-hook.mjs PreToolUse");
    expect(hooks.experienceengine.PostToolUse[0].hooks[0].command).toBe("node experienceengine-antigravity-hook.mjs PostToolUse");
    expect(hooks.experienceengine.Stop[0].command).toBe("node experienceengine-antigravity-hook.mjs Stop");
  });

  it("inspects project activation separately from user-level install state", async () => {
    const tempDir = makeTempDir();
    const env = { EXPERIENCE_ENGINE_HOME: join(tempDir, ".experienceengine") };

    const before = inspectAntigravityProjectWiring({
      cwd: tempDir,
      env,
      homeDir: tempDir
    });
    expect(before.mcpRegistered).toBe(false);
    expect(before.hooksRegistered).toBe(false);
    expect(before.lifecycleMode).toBe("mcp_only");

    await ensureAntigravityProjectWiring({
      cwd: tempDir,
      env,
      homeDir: tempDir
    });

    const after = inspectAntigravityProjectWiring({
      cwd: tempDir,
      env,
      homeDir: tempDir
    });
    expect(after.mcpRegistered).toBe(true);
    expect(after.hooksRegistered).toBe(true);
    expect(after.lifecycleMode).toBe("host_native_hooks_validated");
  });
});
