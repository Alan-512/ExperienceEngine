import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { resolveExperienceEnginePaths } from "../../src/config/path-resolver.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-paths-"));
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

describe("resolveExperienceEnginePaths", () => {
  it("prefers explicit overrides when provided", () => {
    const paths = resolveExperienceEnginePaths({
      homeDir: makeTempDir(),
      overrides: {
        dataDir: "/tmp/custom-root"
      }
    });

    expect(paths.mode).toBe("explicit");
    expect(paths.dataDir).toBe("/tmp/custom-root");
    expect(paths.sqlitePath).toBe("/tmp/custom-root/sqlite/experienceengine.db");
    expect(paths.captureDir).toBe("/tmp/custom-root/captures");
  });

  it("uses compatibility mode when legacy OpenClaw data exists and no install state is present", () => {
    const homeDir = makeTempDir();
    const compatDbPath = join(homeDir, ".openclaw", "experienceengine", "sqlite", "experienceengine.db");
    mkdirSync(join(homeDir, ".openclaw", "experienceengine", "sqlite"), { recursive: true });
    writeFileSync(compatDbPath, "", "utf8");

    const paths = resolveExperienceEnginePaths({ homeDir });

    expect(paths.mode).toBe("openclaw-compat");
    expect(paths.sqlitePath).toBe(compatDbPath);
    expect(paths.captureDir).toBe(join(homeDir, ".openclaw", "experienceengine", "runtime-captures"));
  });

  it("prefers the product home once an install state exists", () => {
    const homeDir = makeTempDir();
    const installStatePath = join(homeDir, ".experienceengine", "adapters", "openclaw", "install.json");
    mkdirSync(join(homeDir, ".experienceengine", "adapters", "openclaw"), { recursive: true });
    writeFileSync(installStatePath, "{}\n", "utf8");

    const paths = resolveExperienceEnginePaths({ homeDir });

    expect(paths.mode).toBe("product");
    expect(paths.activeHome).toBe(join(homeDir, ".experienceengine"));
    expect(paths.usedInstallState).toBe(true);
  });

  it("isolates non-openclaw adapter captures under the adapter state directory", () => {
    const homeDir = makeTempDir();

    const paths = resolveExperienceEnginePaths({
      homeDir,
      adapter: "claude-code"
    });

    expect(paths.mode).toBe("product");
    expect(paths.captureDir).toBe(
      join(homeDir, ".experienceengine", "adapters", "claude-code", "captures")
    );
  });
});
