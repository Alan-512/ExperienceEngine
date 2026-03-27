import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { resolveExperienceEnginePaths } from "../../src/config/path-resolver.js";
import {
  createOpenClawInstallTarball,
  inspectOpenClawInstall,
  installOpenClawAdapter
} from "../../src/install/openclaw-installer.js";
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
      packageSourceBuilder() {
        return join(homeDir, "tmp", "experienceengine-openclaw.tgz");
      },
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
    expect(commands[1]).toBe(`openclaw plugins install ${report.installSource}`);
    expect(report.installSource).toMatch(/experienceengine-openclaw\.tgz$/);
    expect(commands[4]).toBe("openclaw config get plugins");
    expect(commands[5]).toBe('openclaw config set plugins.load.paths ["/tmp/other-plugin"] --json');

    const payload = JSON.parse(readFileSync(report.paths.installStatePath, "utf8")) as {
      adapter: string;
      installedVersion: string;
      installMode: string;
      sqlitePath: string;
      packageRoot: string;
      installSource: string;
      hostWiring: { wired: boolean };
    };

    expect(payload.adapter).toBe("openclaw");
    expect(payload.installedVersion).toBe(report.installedVersion);
    expect(payload.installMode).toBe("packaged-plugin");
    expect(payload.sqlitePath).toBe(report.pluginConfig.sqlitePath);
    expect(payload.packageRoot).toBe(report.packageRoot);
    expect(payload.installSource).toBe(report.installSource);
    expect(payload.hostWiring.wired).toBe(true);
  });

  it("packages the runtime dependencies required by the OpenClaw plugin install", () => {
    const homeDir = makeTempDir();
    const paths = resolveExperienceEnginePaths({ homeDir });
    mkdirSync(join(paths.productHome, "adapters", "openclaw"), { recursive: true });
    const tarballPath = createOpenClawInstallTarball(process.cwd(), paths);
    const manifestPath = join(dirname(tarballPath), "experienceengine-openclaw", "package.json");
    const packagedManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      dependencies: Record<string, string>;
    };

    expect(packagedManifest.dependencies).toEqual({
      "@huggingface/transformers": "^3.8.1",
      zod: "^3.25.76"
    });
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

  it("reinstalls an existing path-based install from the current package root", () => {
    const homeDir = makeTempDir();
    const commands: string[] = [];

    const report = installOpenClawAdapter({
      homeDir,
      packageSourceBuilder() {
        return join(homeDir, "tmp", "experienceengine-openclaw.tgz");
      },
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        commands.push(key);
        if (key === "openclaw config get plugins") {
          return `{
  "load": {
    "paths": []
  },
  "installs": {
    "experienceengine": {
      "source": "path",
      "sourcePath": "/mnt/d/project/ExperienceEngine",
      "installPath": "${join(homeDir, ".openclaw", "extensions", "experienceengine")}"
    }
  }
}`;
        }
        return "";
      }
    });

    expect(commands[1]).toBe(`openclaw plugins install ${report.installSource}`);
    const payload = JSON.parse(readFileSync(report.paths.installStatePath, "utf8")) as {
      installMode: string;
    };
    expect(payload.installMode).toBe("reinstalled-packaged-plugin");
  });

  it("updates an existing npm install via plugins update", () => {
    const homeDir = makeTempDir();
    const commands: string[] = [];

    const report = installOpenClawAdapter({
      homeDir,
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        commands.push(key);
        if (key === "openclaw config get plugins") {
          return `{
  "load": {
    "paths": []
  },
  "installs": {
    "experienceengine": {
      "source": "npm",
      "installPath": "${join(homeDir, ".openclaw", "extensions", "experienceengine")}"
    }
  }
}`;
        }
        return "";
      }
    });

    expect(commands[1]).toBe("openclaw plugins update experienceengine");
    const payload = JSON.parse(readFileSync(report.paths.installStatePath, "utf8")) as {
      installMode: string;
    };
    expect(payload.installMode).toBe("updated-plugin");
  });

  it("reinstalls when the extension directory exists without install metadata", () => {
    const homeDir = makeTempDir();
    const commands: string[] = [];
    const installPath = join(homeDir, ".openclaw", "extensions", "experienceengine");
    mkdirSync(installPath, { recursive: true });

    const report = installOpenClawAdapter({
      homeDir,
      packageSourceBuilder() {
        return join(homeDir, "tmp", "experienceengine-openclaw.tgz");
      },
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        commands.push(key);
        if (key === "openclaw config get plugins") {
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

    expect(commands[1]).toBe(`openclaw plugins install ${report.installSource}`);
    const payload = JSON.parse(readFileSync(report.paths.installStatePath, "utf8")) as {
      installMode: string;
    };
    expect(payload.installMode).toBe("reinstalled-packaged-plugin");
  });

  it("refuses to delete an install path that points at a live git working tree", () => {
    const homeDir = makeTempDir();
    const packageRoot = join(homeDir, "live-repo");
    mkdirSync(join(packageRoot, ".git"), { recursive: true });
    mkdirSync(packageRoot, { recursive: true });

    expect(() =>
      installOpenClawAdapter({
        homeDir,
        packageSourceBuilder() {
          return join(homeDir, "tmp", "experienceengine-openclaw.tgz");
        },
        runner(command) {
          const key = [command.bin, ...command.args].join(" ");
          if (key === "openclaw config get plugins") {
            return `{
  "load": {
    "paths": []
  },
  "installs": {
    "experienceengine": {
      "source": "path",
      "sourcePath": "${packageRoot}",
      "installPath": "${packageRoot}"
    }
  }
}`;
          }
          return "";
        }
      })
    ).toThrow(/refusing to delete.*git working tree/i);
  });
});
