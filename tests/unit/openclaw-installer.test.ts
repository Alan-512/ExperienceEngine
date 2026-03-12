import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { inspectOpenClawInstall, installOpenClawAdapter } from "../../src/install/openclaw-installer.js";
import { readCurrentPackageVersion } from "../../src/version/package-version.js";

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
  const currentVersion = readCurrentPackageVersion();

  it("writes install state into the product-owned data home", () => {
    const homeDir = makeTempDir();
    const commands: string[] = [];
    let pluginsReads = 0;
    const report = installOpenClawAdapter({
      homeDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        commands.push(key);
        if (key === "openclaw config get plugins") {
          pluginsReads += 1;
          if (pluginsReads === 1) {
            return `{
  "load": {
    "paths": [
      "/mnt/d/project/ExperienceEngine",
      "/tmp/other-plugin"
    ]
  },
  "installs": {
  }
}`;
          }
          return `{
  "load": {
    "paths": [
      "/mnt/d/project/ExperienceEngine",
      "/tmp/other-plugin"
    ]
  },
  "installs": {
    "experienceengine": {
      "installPath": "${join(homeDir, ".openclaw", "extensions", "experienceengine")}"
    }
  }
}`;
        }
        return "";
      }
    });

    expect(report.installed).toBe(true);
    expect(report.paths.mode).toBe("product");
    expect(existsSync(report.paths.installStatePath)).toBe(true);
    expect(commands).toHaveLength(6);
    expect(commands[0]).toBe(`openclaw config get plugins`);
    expect(commands[1]).toBe(`openclaw plugins install ${report.packageRoot}`);
    expect(commands[4]).toBe("openclaw config get plugins");
    expect(commands[5]).toBe('openclaw config set plugins.load.paths ["/tmp/other-plugin"] --json');

    const payload = JSON.parse(readFileSync(report.paths.installStatePath, "utf8")) as {
      adapter: string;
      installedVersion: string;
      installMode: string;
      sqlitePath: string;
      packageRoot: string;
      hostWiring: { wired: boolean };
    };

    expect(payload.adapter).toBe("openclaw");
    expect(payload.installedVersion).toBe(report.installedVersion);
    expect(payload.installMode).toBe("copied-plugin");
    expect(payload.sqlitePath).toBe(report.pluginConfig.sqlitePath);
    expect(payload.packageRoot).toBe(report.packageRoot);
    expect(payload.hostWiring.wired).toBe(true);
  });

  it("reports install status and resolved paths for doctor output", () => {
    const homeDir = makeTempDir();
    installOpenClawAdapter({
      homeDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "openclaw config get plugins") {
          return `{
  "load": {
    "paths": []
  },
  "installs": {
    "experienceengine": {
      "installPath": "${join(homeDir, ".openclaw", "extensions", "experienceengine")}"
    }
  }
}`;
        }
        return "";
      }
    });

    const status = inspectOpenClawInstall({
      homeDir,
      runner() {
        return "";
      }
    });

    expect(status.installed).toBe(true);
    expect(status.versionStatus.recordedVersion).toBe(currentVersion);
    expect(status.versionStatus.state).toBe("current");
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

    const status = inspectOpenClawInstall({
      homeDir,
      runner() {
        return "";
      }
    });
    expect(status.installed).toBe(false);
    expect(status.hostWiring.wired).toBe(false);
  });

  it("updates an existing install instead of reinstalling it", () => {
    const homeDir = makeTempDir();
    const commands: string[] = [];
    let pluginsReads = 0;

    installOpenClawAdapter({
      homeDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        commands.push(key);
        if (key === "openclaw config get plugins") {
          pluginsReads += 1;
          return `{
  "load": {
    "paths": []
  },
  "installs": {
    "experienceengine": {
      "installPath": "${join(homeDir, ".openclaw", "extensions", "experienceengine")}"
    }
  }
}`;
        }
        return "";
      }
    });

    expect(commands[1]).toBe("openclaw plugins update experienceengine");
  });
});
