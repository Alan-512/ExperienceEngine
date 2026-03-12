import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { inspectOpenClawInstall, installOpenClawAdapter } from "../../src/install/openclaw-installer.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-install-"));
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

describe("OpenClaw installer", () => {
  it("writes install state into the product-owned data home", () => {
    const homeDir = makeTempDir();
    const report = installOpenClawAdapter({ homeDir });

    expect(report.installed).toBe(true);
    expect(report.paths.mode).toBe("product");
    expect(existsSync(report.paths.installStatePath)).toBe(true);

    const payload = JSON.parse(readFileSync(report.paths.installStatePath, "utf8")) as {
      adapter: string;
      sqlitePath: string;
    };

    expect(payload.adapter).toBe("openclaw");
    expect(payload.sqlitePath).toBe(report.pluginConfig.sqlitePath);
  });

  it("reports install status and resolved paths for doctor output", () => {
    const homeDir = makeTempDir();
    installOpenClawAdapter({ homeDir });

    const status = inspectOpenClawInstall({ homeDir });

    expect(status.installed).toBe(true);
    expect(status.pathMode).toBe("product");
    expect(status.activeHome).toBe(join(homeDir, ".experienceengine"));
  });
});
