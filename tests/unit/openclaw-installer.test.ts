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
const originalHybridEnv = {
  EXPERIENCE_ENGINE_HYBRID_ENABLED: process.env.EXPERIENCE_ENGINE_HYBRID_ENABLED,
  EXPERIENCE_ENGINE_HYBRID_SYNC_EXPLAIN_ENABLED: process.env.EXPERIENCE_ENGINE_HYBRID_SYNC_EXPLAIN_ENABLED,
  EXPERIENCE_ENGINE_HYBRID_EXPLAIN_LLM_ENABLED: process.env.EXPERIENCE_ENGINE_HYBRID_EXPLAIN_LLM_ENABLED,
  EXPERIENCE_ENGINE_DISTILLER_PROVIDER: process.env.EXPERIENCE_ENGINE_DISTILLER_PROVIDER,
  EXPERIENCE_ENGINE_DISTILLER_MODEL: process.env.EXPERIENCE_ENGINE_DISTILLER_MODEL
};

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
  for (const [key, value] of Object.entries(originalHybridEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("OpenClaw installer", () => {
  const currentVersion = readCurrentPackageVersion();

  it("writes install state into the product-owned data home", () => {
    const homeDir = makeTempDir();
    const commands: string[] = [];
    let pluginsReads = 0;
    process.env.EXPERIENCE_ENGINE_HYBRID_ENABLED = "true";
    process.env.EXPERIENCE_ENGINE_HYBRID_SYNC_EXPLAIN_ENABLED = "true";
    process.env.EXPERIENCE_ENGINE_HYBRID_EXPLAIN_LLM_ENABLED = "true";
    process.env.EXPERIENCE_ENGINE_DISTILLER_PROVIDER = "gemini";
    process.env.EXPERIENCE_ENGINE_DISTILLER_MODEL = "gemini-3.1-flash-lite-preview";
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
    expect(commands).toHaveLength(7);
    expect(commands[0]).toBe("openclaw config get plugins.entries.experienceengine");
    expect(commands[1]).toBe(`openclaw config get plugins`);
    expect(commands[2]).toBe(`openclaw plugins install ${report.installSource}`);
    expect(report.installSource).toMatch(/experienceengine-openclaw\.tgz$/);
    expect(commands[5]).toBe("openclaw config get plugins");
    expect(commands[6]).toBe('openclaw config set plugins.load.paths ["/tmp/other-plugin"] --json');

    const payload = JSON.parse(readFileSync(report.paths.installStatePath, "utf8")) as {
      adapter: string;
      installedVersion: string;
      installMode: string;
      sqlitePath: string;
      hybridEnabled: boolean;
      hybridSyncExplainEnabled: boolean;
      hybridExplainLlmEnabled: boolean;
      distillerProvider: string;
      distillerModel: string;
      packageRoot: string;
      installSource: string;
      hostWiring: { wired: boolean };
    };

    expect(payload.adapter).toBe("openclaw");
    expect(payload.installedVersion).toBe(report.installedVersion);
    expect(payload.installMode).toBe("packaged-plugin");
    expect(payload.sqlitePath).toBe(report.pluginConfig.sqlitePath);
    expect(payload.hybridEnabled).toBe(true);
    expect(payload.hybridSyncExplainEnabled).toBe(true);
    expect(payload.hybridExplainLlmEnabled).toBe(true);
    expect(payload.distillerProvider).toBe("gemini");
    expect(payload.distillerModel).toBe("gemini-3.1-flash-lite-preview");
    expect(payload.packageRoot).toBe(report.packageRoot);
    expect(payload.installSource).toBe(report.installSource);
    expect(payload.hostWiring.wired).toBe(true);
  });

  it("treats hybrid explain config drift as host config mismatch", () => {
    const homeDir = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HYBRID_ENABLED = "true";
    process.env.EXPERIENCE_ENGINE_HYBRID_SYNC_EXPLAIN_ENABLED = "true";
    process.env.EXPERIENCE_ENGINE_HYBRID_EXPLAIN_LLM_ENABLED = "true";
    process.env.EXPERIENCE_ENGINE_DISTILLER_PROVIDER = "gemini";
    process.env.EXPERIENCE_ENGINE_DISTILLER_MODEL = "gemini-3.1-flash-lite-preview";

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
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "openclaw plugins info experienceengine") {
          return `ExperienceEngine
id: experienceengine
Status: loaded
Source: ~/.openclaw/extensions/experienceengine/dist/plugin/openclaw-plugin.js
Origin: global
Version: 0.1.3

Install: archive
Source path: ~/.experienceengine/adapters/openclaw/openclaw-package/test.tgz
Install path: ~/.openclaw/extensions/experienceengine
Recorded version: 0.1.3`;
        }
        if (key === "openclaw config get plugins.entries.experienceengine") {
          return `{
  "enabled": true,
  "config": {
    "dataDir": "${join(homeDir, ".experienceengine")}",
    "sqlitePath": "${join(homeDir, ".experienceengine", "sqlite", "experienceengine.db")}",
    "captureDir": "${join(homeDir, ".experienceengine", "captures")}"
  }
}`;
        }
        return "";
      }
    });

    expect(status.hostState.configMatches).toBe(false);
  });

  it("preserves existing hybrid explain config during upgrade when env defaults are disabled", () => {
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
        if (key === "openclaw config get plugins.entries.experienceengine") {
          return `{
  "enabled": true,
  "config": {
    "dataDir": "${join(homeDir, ".experienceengine")}",
    "sqlitePath": "${join(homeDir, ".experienceengine", "sqlite", "experienceengine.db")}",
    "captureDir": "${join(homeDir, ".experienceengine", "captures")}",
    "distillerProvider": "gemini",
    "distillerModel": "gemini-3.1-flash-lite-preview",
    "hybridEnabled": true,
    "hybridSyncExplainEnabled": true,
    "hybridAsyncPostmortemEnabled": false,
    "hybridExplainLlmEnabled": true,
    "hybridExplainProviderMode": "shared_distiller",
    "hybridExplainModelProfileVersion": "hybrid-explain-llm-v1"
  }
}`;
        }
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

    expect(commands[1]).toBe("openclaw config get plugins");
    expect(commands[2]).toBe("openclaw plugins update experienceengine");
    expect(commands[4]).toContain('"hybridEnabled":true');
    expect(report.pluginConfig.hybridEnabled).toBe(true);
    expect(report.pluginConfig.hybridExplainLlmEnabled).toBe(true);
    expect(report.pluginConfig.distillerProvider).toBe("gemini");
  });

  it("lets explicit hybrid env overrides replace stale OpenClaw plugin config during upgrade", () => {
    const homeDir = makeTempDir();
    process.env.EXPERIENCE_ENGINE_HYBRID_ENABLED = "true";
    process.env.EXPERIENCE_ENGINE_HYBRID_SYNC_EXPLAIN_ENABLED = "true";
    process.env.EXPERIENCE_ENGINE_HYBRID_EXPLAIN_LLM_ENABLED = "true";
    process.env.EXPERIENCE_ENGINE_DISTILLER_PROVIDER = "gemini";
    process.env.EXPERIENCE_ENGINE_DISTILLER_MODEL = "gemini-3.1-flash-lite-preview";

    const report = installOpenClawAdapter({
      homeDir,
      packageSourceBuilder() {
        return join(homeDir, "tmp", "experienceengine-openclaw.tgz");
      },
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "openclaw config get plugins.entries.experienceengine") {
          return `{
  "enabled": true,
  "config": {
    "dataDir": "${join(homeDir, ".experienceengine")}",
    "sqlitePath": "${join(homeDir, ".experienceengine", "sqlite", "experienceengine.db")}",
    "captureDir": "${join(homeDir, ".experienceengine", "captures")}",
    "distillerProvider": "gemini",
    "distillerModel": "old-model",
    "hybridEnabled": false,
    "hybridSyncExplainEnabled": false,
    "hybridAsyncPostmortemEnabled": false,
    "hybridExplainLlmEnabled": false,
    "hybridExplainProviderMode": "shared_distiller",
    "hybridExplainModelProfileVersion": "hybrid-explain-llm-v0"
  }
}`;
        }
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

    expect(report.pluginConfig.hybridEnabled).toBe(true);
    expect(report.pluginConfig.hybridSyncExplainEnabled).toBe(true);
    expect(report.pluginConfig.hybridExplainLlmEnabled).toBe(true);
    expect(report.pluginConfig.distillerModel).toBe("gemini-3.1-flash-lite-preview");
    expect(report.pluginConfig.hybridExplainModelProfileVersion).toBe("hybrid-explain-llm-v0");
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

    expect(commands[2]).toBe(`openclaw plugins install ${report.installSource}`);
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
      "source": "npm",
      "installPath": "${join(homeDir, ".openclaw", "extensions", "experienceengine")}"
    }
  }
}`;
        }
        return "";
      }
    });

    expect(commands[2]).toBe("openclaw plugins update experienceengine");
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

    expect(commands[2]).toBe(`openclaw plugins install ${report.installSource}`);
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
