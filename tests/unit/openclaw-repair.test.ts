import { describe, expect, it } from "vitest";
import { afterEach } from "vitest";
import {
  resolveExperienceEnginePackageRoot
} from "../../src/install/openclaw-cli.js";
import {
  getOpenClawRepairHint,
  inspectOpenClawInstall,
  installOpenClawAdapter,
  isOpenClawRepairRecommended,
  repairOpenClawAdapter
} from "../../src/install/openclaw-installer.js";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { removeTempDirForTests } from "./temp-cleanup.js";

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
      removeTempDirForTests(dir);
    }
  }
};

const jsonString = (value: string): string => JSON.stringify(value);

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
    let installReads = 0;

    installOpenClawAdapter({
      homeDir,
      packageSourceBuilder() {
        return join(homeDir, "tmp", "experienceengine-openclaw.tgz");
      },
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        seen.push(key);
        if (key === "openclaw config get plugins") {
          installReads += 1;
          if (installReads === 1) {
            return `{
  "load": {
    "paths": []
  },
  "installs": {
  }
}`;
          }
          return `{
  "load": {
    "paths": []
  },
  "installs": {
  }
}`;
        }
        return "";
      }
    });

    const repairSeen: string[] = [];
    let repairReads = 0;
    const report = repairOpenClawAdapter({
      homeDir,
      packageSourceBuilder() {
        return join(homeDir, "tmp", "experienceengine-openclaw.tgz");
      },
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        repairSeen.push(key);
        if (key === "openclaw config get plugins") {
          repairReads += 1;
          return `{
  "load": {
    "paths": []
  },
  "installs": {
    "experienceengine": {
      "installPath": ${jsonString(join(homeDir, ".openclaw", "extensions", "experienceengine"))}
    }
  }
}`;
        }
        return "";
      }
    });

    expect(seen[2]).toBe(`openclaw plugins install ${report.installSource}`);
    expect(repairSeen[2]).toBe(`openclaw plugins install ${report.installSource}`);
    expect(report.installed).toBe(true);
  });

  it("marks a healthy host as not needing repair after aligned inspection", () => {
    const homeDir = makeTempDir();
    const packageRoot = resolveExperienceEnginePackageRoot();

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
Source path: ${packageRoot}
Install path: ${packageRoot}
`;
        }

        return `{
  "enabled": true,
    "config": {
    "dataDir": ${jsonString(join(homeDir, ".experienceengine"))},
    "sqlitePath": ${jsonString(join(homeDir, ".experienceengine", "sqlite", "experienceengine.db"))},
    "captureDir": ${jsonString(join(homeDir, ".experienceengine", "captures"))}
  }
}`;
      }
    });

    expect(isOpenClawRepairRecommended(status)).toBe(false);
    expect(status.hostWiring.restartRecommended).toBe(false);
  }, 20_000);
});
