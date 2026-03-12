import { describe, expect, it } from "vitest";
import { afterEach } from "vitest";
import {
  getOpenClawRepairHint,
  inspectOpenClawInstall,
  installOpenClawAdapter,
  isOpenClawRepairRecommended,
  repairOpenClawAdapter
} from "../../src/install/openclaw-installer.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-repair-"));
  tempDirs.push(dir);
  return dir;
};

const cleanup = (): void => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
};

describe("OpenClaw repair recommendation", () => {
  afterEach(() => {
    cleanup();
  });

  it("recommends repair when host state reports errors or config drift", () => {
    expect(
      isOpenClawRepairRecommended({
        installed: true,
        hostState: {
          status: "error",
          enabled: true,
          configMatches: false,
          error: "EACCES"
        }
      })
    ).toBe(true);
    expect(
      getOpenClawRepairHint({
        installed: true,
        hostState: {
          status: "error",
          enabled: true,
          configMatches: false,
          error: "EACCES"
        }
      })
    ).toBe("ee repair openclaw");
  });

  it("does not recommend repair when host state is healthy and matched", () => {
    expect(
      isOpenClawRepairRecommended({
        installed: true,
        hostState: {
          status: "loaded",
          enabled: true,
          configMatches: true,
          error: undefined
        }
      })
    ).toBe(false);
    expect(
      getOpenClawRepairHint({
        installed: true,
        hostState: {
          status: "loaded",
          enabled: true,
          configMatches: true,
          error: undefined
        }
      })
    ).toBeNull();
  });

  it("reuses install wiring for repair", () => {
    const homeDir = makeTempDir();
    const seen: string[] = [];

    installOpenClawAdapter({
      homeDir,
      runner(command) {
        seen.push([command.bin, ...command.args].join(" "));
        return "";
      }
    });

    const repairSeen: string[] = [];
    const report = repairOpenClawAdapter({
      homeDir,
      runner(command) {
        repairSeen.push([command.bin, ...command.args].join(" "));
        return "";
      }
    });

    expect(repairSeen).toEqual(seen);
    expect(report.installed).toBe(true);
  });

  it("marks a healthy host as not needing repair after aligned inspection", () => {
    const homeDir = makeTempDir();

    installOpenClawAdapter({
      homeDir,
      runner() {
        return "";
      }
    });

    const status = inspectOpenClawInstall({
      homeDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key.includes("plugins info")) {
          return `ExperienceEngine
id: experienceengine
Status: loaded
Source path: ~/workspace/ExperienceEngine
Install path: ~/workspace/ExperienceEngine
`;
        }

        return `{
  "enabled": true,
  "config": {
    "dataDir": "${join(homeDir, ".experienceengine")}",
    "sqlitePath": "${join(homeDir, ".experienceengine", "sqlite", "experienceengine.db")}",
    "captureDir": "${join(homeDir, ".experienceengine", "captures")}"
  }
}`;
      }
    });

    expect(isOpenClawRepairRecommended(status)).toBe(false);
  });
});
