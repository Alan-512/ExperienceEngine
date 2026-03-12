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
    const commands: string[] = [];
    const report = installOpenClawAdapter({
      homeDir,
      runner(command) {
        commands.push([command.bin, ...command.args].join(" "));
      }
    });

    expect(report.installed).toBe(true);
    expect(report.paths.mode).toBe("product");
    expect(existsSync(report.paths.installStatePath)).toBe(true);
    expect(commands).toHaveLength(3);

    const payload = JSON.parse(readFileSync(report.paths.installStatePath, "utf8")) as {
      adapter: string;
      sqlitePath: string;
      packageRoot: string;
      hostWiring: { wired: boolean };
    };

    expect(payload.adapter).toBe("openclaw");
    expect(payload.sqlitePath).toBe(report.pluginConfig.sqlitePath);
    expect(payload.packageRoot).toBe(report.packageRoot);
    expect(payload.hostWiring.wired).toBe(true);
  });

  it("reports install status and resolved paths for doctor output", () => {
    const homeDir = makeTempDir();
    installOpenClawAdapter({
      homeDir,
      runner() {
        return;
      }
    });

    const status = inspectOpenClawInstall({ homeDir });

    expect(status.installed).toBe(true);
    expect(status.pathMode).toBe("product");
    expect(status.activeHome).toBe(join(homeDir, ".experienceengine"));
    expect(status.hostWiring.wired).toBe(true);
    expect(typeof status.packageRoot).toBe("string");
  });

  it("does not write install state when host wiring fails", () => {
    const homeDir = makeTempDir();

    expect(() =>
      installOpenClawAdapter({
        homeDir,
        runner() {
          throw new Error("openclaw not found");
        }
      })
    ).toThrow("openclaw not found");

    const status = inspectOpenClawInstall({ homeDir });
    expect(status.installed).toBe(false);
    expect(status.hostWiring.wired).toBe(false);
  });
});
