import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { resolveExperienceEnginePaths } from "../../src/config/path-resolver.js";
import {
  createOpenClawInstallTarball,
  inspectOpenClawInstall,
  installOpenClawAdapter
} from "../../src/install/openclaw-installer.js";
import { readCurrentPackageVersion } from "../../src/version/package-version.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];
let cachedPackagedTarball:
  | {
      tarballPath: string;
      stageDir: string;
    }
  | undefined;
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

const jsonString = (value: string): string => JSON.stringify(value);

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      removeTempDirForTests(dir);
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

afterAll(() => {
  if (cachedPackagedTarball) {
    rmSync(dirname(cachedPackagedTarball.tarballPath), { recursive: true, force: true });
    cachedPackagedTarball = undefined;
  }
});

const getCachedPackagedTarball = (): { tarballPath: string; stageDir: string } => {
  if (cachedPackagedTarball) {
    return cachedPackagedTarball;
  }

  const homeDir = mkdtempSync(join(tmpdir(), "experienceengine-packaged-openclaw-"));
  const paths = resolveExperienceEnginePaths({ homeDir });
  mkdirSync(join(paths.productHome, "adapters", "openclaw"), { recursive: true });
  const tarballPath = createOpenClawInstallTarball(process.cwd(), paths);
  cachedPackagedTarball = {
    tarballPath,
    stageDir: join(dirname(tarballPath), "experienceengine-openclaw")
  };
  return cachedPackagedTarball;
};

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
      "installPath": ${jsonString(join(homeDir, ".openclaw", "extensions", "experienceengine"))}
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
    expect(commands[0]).toBe("openclaw config get plugins.entries.experienceengine");
    expect(commands[1]).toBe(`openclaw config get plugins`);
    expect(commands[2]).toBe(`openclaw plugins install ${report.installSource}`);
    expect(report.installSource).toMatch(/experienceengine-openclaw\.tgz$/);
    expect(commands[5]).toBe('openclaw config set plugins.load.paths ["/tmp/other-plugin"] --json');

    const payload = JSON.parse(readFileSync(report.paths.installStatePath, "utf8")) as {
      adapter: string;
      installedVersion: string;
      installMode: string;
      sqlitePath: string;
      hybridEnabled: boolean;
      hybridSyncExplainEnabled: boolean;
      hybridAsyncPostmortemLlmEnabled: boolean;
      hybridExplainLlmEnabled: boolean;
      hybridPostmortemProviderMode: string;
      hybridPostmortemModelProfileVersion: string;
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
    expect(payload.hybridAsyncPostmortemLlmEnabled).toBe(false);
    expect(payload.hybridExplainLlmEnabled).toBe(true);
    expect(payload.hybridPostmortemProviderMode).toBe("shared_distiller");
    expect(payload.hybridPostmortemModelProfileVersion).toBe("hybrid-postmortem-llm-v1");
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
      packageSourceBuilder() {
        return join(homeDir, "tmp", "experienceengine-openclaw.tgz");
      },
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "openclaw config get plugins") {
          return `{
  "allow": ["experienceengine"],
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
Version: 0.2.0

Install: archive
Source path: ~/.experienceengine/adapters/openclaw/openclaw-package/test.tgz
Install path: ~/.openclaw/extensions/experienceengine
Recorded version: 0.2.0`;
        }
        if (key === "openclaw config get plugins.entries.experienceengine") {
          return `{
  "enabled": true,
  "config": {
    "dataDir": ${jsonString(join(homeDir, ".experienceengine"))},
    "sqlitePath": ${jsonString(join(homeDir, ".experienceengine", "sqlite", "experienceengine.db"))},
    "captureDir": ${jsonString(join(homeDir, ".experienceengine", "captures"))}
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
        if (key === "openclaw config get plugins.entries.experienceengine") {
          return `{
  "enabled": true,
  "config": {
    "dataDir": ${jsonString(join(homeDir, ".experienceengine"))},
    "sqlitePath": ${jsonString(join(homeDir, ".experienceengine", "sqlite", "experienceengine.db"))},
    "captureDir": ${jsonString(join(homeDir, ".experienceengine", "captures"))},
    "distillerProvider": "gemini",
    "distillerModel": "gemini-3.1-flash-lite-preview",
    "hybridEnabled": true,
    "hybridSyncExplainEnabled": true,
    "hybridAsyncPostmortemEnabled": false,
    "hybridAsyncPostmortemLlmEnabled": false,
    "hybridExplainLlmEnabled": true,
    "hybridExplainProviderMode": "shared_distiller",
    "hybridExplainModelProfileVersion": "hybrid-explain-llm-v1",
    "hybridPostmortemProviderMode": "shared_distiller",
    "hybridPostmortemModelProfileVersion": "hybrid-postmortem-llm-v1"
  }
}`;
        }
        if (key === "openclaw config get plugins") {
          return `{
  "allow": ["experienceengine"],
  "load": {
    "paths": []
  },
      "installs": {
        "experienceengine": {
          "source": "npm",
          "installPath": ${jsonString(installPath)}
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
    expect(report.pluginConfig.hybridPostmortemProviderMode).toBe("shared_distiller");
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
    "dataDir": ${jsonString(join(homeDir, ".experienceengine"))},
    "sqlitePath": ${jsonString(join(homeDir, ".experienceengine", "sqlite", "experienceengine.db"))},
    "captureDir": ${jsonString(join(homeDir, ".experienceengine", "captures"))},
    "distillerProvider": "gemini",
    "distillerModel": "old-model",
    "hybridEnabled": false,
    "hybridSyncExplainEnabled": false,
    "hybridAsyncPostmortemEnabled": false,
    "hybridAsyncPostmortemLlmEnabled": false,
    "hybridExplainLlmEnabled": false,
    "hybridExplainProviderMode": "shared_distiller",
    "hybridExplainModelProfileVersion": "hybrid-explain-llm-v0",
    "hybridPostmortemProviderMode": "shared_distiller",
    "hybridPostmortemModelProfileVersion": "hybrid-postmortem-llm-v0"
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
      "installPath": ${jsonString(join(homeDir, ".openclaw", "extensions", "experienceengine"))}
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
    expect(report.pluginConfig.hybridPostmortemModelProfileVersion).toBe("hybrid-postmortem-llm-v0");
  });

  it("packages the runtime dependencies required by the OpenClaw plugin install", () => {
    const { stageDir } = getCachedPackagedTarball();
    const manifestPath = join(stageDir, "package.json");
    const packagedManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      dependencies: Record<string, string>;
    };

    expect(packagedManifest.dependencies).toEqual({
      "@modelcontextprotocol/sdk": "^1.27.1",
      zod: "^3.25.76"
    });
    expect(existsSync(join(
      stageDir,
      "dist",
      "runtime",
      "package",
      "runtime-closure-manifest.json"
    ))).toBe(true);
  }, 30000);

  it("packages the OpenClaw compatibility metadata required by ClawHub publishing", () => {
    const { stageDir } = getCachedPackagedTarball();
    const manifestPath = join(stageDir, "package.json");
    const packagedManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      version?: string;
      openclaw?: {
        compat?: { pluginApi?: string; minGatewayVersion?: string };
        build?: { openclawVersion?: string; pluginSdkVersion?: string };
      };
    };
    const pluginManifest = JSON.parse(readFileSync(join(stageDir, "openclaw.plugin.json"), "utf8")) as {
      version?: string;
      activation?: { onStartup?: boolean };
    };

    expect(pluginManifest.version).toBe(packagedManifest.version);
    expect(pluginManifest.activation?.onStartup).toBe(true);
    expect(packagedManifest.openclaw?.compat?.pluginApi).toBe(">=2026.4.1");
    expect(packagedManifest.openclaw?.compat?.minGatewayVersion).toBe("2026.4.1");
    expect(packagedManifest.openclaw?.build?.openclawVersion).toBe("2026.4.1");
    expect(packagedManifest.openclaw?.build?.pluginSdkVersion).toBe("2026.4.1");
  }, 15000);

  it("packages only the OpenClaw hook runtime closure needed by the installed plugin", () => {
    const { tarballPath } = getCachedPackagedTarball();
    const entries = execFileSync("tar", ["-tzf", tarballPath], {
      encoding: "utf8"
    })
      .split(/\r?\n/)
      .filter(Boolean);

    expect(entries).toContain("package/dist/plugin/openclaw-plugin.js");
    expect(entries).toContain("package/dist/runtime/service.js");
    expect(entries).toContain("package/dist/store/sqlite/db.js");
    expect(entries).toContain("package/dist/store/sqlite/schema.sql");
    expect(entries).toContain("package/dist/runtime/package/runtime-closure-manifest.json");
    expect(entries).toContain("package/dist/plugin/openclaw-install-state.js");
    expect(entries).toContain("package/dist/hybrid/capsule-builder.js");
    expect(entries).toContain("package/dist/hybrid/worker-client.js");
    expect(entries).toContain("package/dist/hybrid/postmortem-provider-client.js");

    expect(entries).not.toContain("package/dist/cli/index.js");
    expect(entries).not.toContain("package/dist/install/openclaw-installer.js");
    expect(entries).not.toContain("package/dist/install/openclaw-cli.js");
    expect(entries).not.toContain("package/dist/install/codex-installer.js");
    expect(entries).not.toContain("package/dist/evaluation/openclaw-scenarios.js");
    expect(entries).not.toContain("package/dist/maintenance/claude-validate-print.js");
    expect(entries).not.toContain("package/dist/adapters/codex/mcp-server.js");
    expect(entries).not.toContain("package/dist/runtime/distribution/npm-artifact-validator.js");
    expect(entries).not.toContain("package/dist/runtime/distribution/clawhub-artifact-validator.js");
  }, 15000);

  it("reports install status and resolved paths for doctor output", () => {
    const homeDir = makeTempDir();
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
      "installPath": ${jsonString(join(homeDir, ".openclaw", "extensions", "experienceengine"))}
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
        packageSourceBuilder() {
          return join(homeDir, "tmp", "experienceengine-openclaw.tgz");
        },
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
      "installPath": ${jsonString(join(homeDir, ".openclaw", "extensions", "experienceengine"))}
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
    "experienceengine": {
      "source": "npm",
      "installPath": ${jsonString(installPath)}
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

  it("self-heals missing npm install directories with install instead of update", () => {
    const homeDir = makeTempDir();
    const commands: string[] = [];
    const missingInstallPath = join(homeDir, ".openclaw", "extensions", "experienceengine");

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
      "installPath": ${jsonString(missingInstallPath)}
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
    expect(payload.installMode).toBe("packaged-plugin");
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

  it("moves an existing safe reinstall directory aside before asking OpenClaw to install", () => {
    const homeDir = makeTempDir();
    const commands: string[] = [];
    const installPath = join(homeDir, ".openclaw", "extensions", "experienceengine");
    mkdirSync(installPath, { recursive: true });

    installOpenClawAdapter({
      homeDir,
      packageSourceBuilder() {
        return join(homeDir, "tmp", "experienceengine-openclaw.tgz");
      },
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        commands.push(key);
        if (key === "openclaw config get plugins") {
          return `{
  "allow": ["experienceengine"],
  "load": {
    "paths": []
  },
  "installs": {
    "experienceengine": {
      "source": "path",
      "sourcePath": "/mnt/d/project/ExperienceEngine",
      "installPath": ${jsonString(installPath)}
    }
  }
}`;
        }
        if (key.startsWith("openclaw plugins install ")) {
          expect(existsSync(installPath)).toBe(false);
        }
        return "";
      }
    });

    expect(commands[2]).toMatch(/^openclaw plugins install /);
    expect(commands).not.toContain("openclaw config set plugins.allow [] --json");
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
      "sourcePath": ${jsonString(packageRoot)},
      "installPath": ${jsonString(packageRoot)}
    }
  }
}`;
          }
          return "";
        }
      })
    ).toThrow(/refusing to delete.*git working tree/i);
  });

  it("returns approval-required and restores the old plugin when the host security scan blocks", () => {
    const homeDir = makeTempDir();
    const installPath = join(homeDir, ".openclaw", "extensions", "experienceengine");
    const marker = join(installPath, "old-version.txt");
    mkdirSync(installPath, { recursive: true });
    writeFileSync(marker, "old-working-version", "utf8");

    expect(() => installOpenClawAdapter({
      homeDir,
      packageSourceBuilder() {
        return join(homeDir, "tmp", "candidate.tgz");
      },
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "openclaw config get plugins") {
          return JSON.stringify({
            allow: ["experienceengine"],
            load: { paths: [] },
            installs: {
              experienceengine: {
                source: "path",
                sourcePath: "fixture-source",
                installPath
              }
            }
          });
        }
        if (key.startsWith("openclaw plugins install ")) {
          throw new Error(
            "security scan blocked install; use --dangerously-force-unsafe-install"
          );
        }
        return "";
      }
    })).toThrow(expect.objectContaining({
      code: "EE_OPENCLAW_SECURITY_APPROVAL_REQUIRED"
    }));
    expect(readFileSync(marker, "utf8")).toBe("old-working-version");
    const paths = resolveExperienceEnginePaths({ adapter: "openclaw", homeDir });
    expect(existsSync(paths.installStatePath)).toBe(false);
  });

  it("retries only the exact install command after explicit security approval", () => {
    const homeDir = makeTempDir();
    const commands: string[] = [];
    let installAttempt = 0;
    const report = installOpenClawAdapter({
      homeDir,
      approveHostSecurityScan: true,
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      packageSourceBuilder() {
        return join(homeDir, "tmp", "candidate.tgz");
      },
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        commands.push(key);
        if (key === "openclaw config get plugins") {
          return JSON.stringify({ load: { paths: [] }, installs: {} });
        }
        if (key.startsWith("openclaw plugins install ")) {
          installAttempt += 1;
          if (installAttempt === 1) {
            throw new Error(
              "security scan blocked install; use --dangerously-force-unsafe-install"
            );
          }
          expect(key).toContain("--dangerously-force-unsafe-install");
        }
        return "";
      }
    });
    expect(installAttempt).toBe(2);
    expect(report.securityApproval).toMatchObject({
      scan_status: "approved",
      approval_method: "explicit_cli",
      approved_at: "2026-07-14T12:00:00.000Z"
    });
    expect(report.securityApproval.scan_summary_digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(commands.filter((command) =>
      command.includes("dangerously-force-unsafe-install")
    )).toHaveLength(1);
  });

  it("restores the old plugin and install state when post-install closure verification fails", () => {
    const homeDir = makeTempDir();
    const installPath = join(homeDir, ".openclaw", "extensions", "experienceengine");
    const marker = join(installPath, "old-version.txt");
    mkdirSync(installPath, { recursive: true });
    writeFileSync(marker, "old-working-version", "utf8");
    const paths = resolveExperienceEnginePaths({ adapter: "openclaw", homeDir });
    mkdirSync(dirname(paths.installStatePath), { recursive: true });
    writeFileSync(paths.installStatePath, "old-install-state", "utf8");

    expect(() => installOpenClawAdapter({
      homeDir,
      packageSourceBuilder() {
        return join(homeDir, "tmp", "candidate.tgz");
      },
      postInstallVerifier() {
        throw new Error("installed closure mismatch");
      },
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "openclaw config get plugins") {
          return JSON.stringify({
            load: { paths: [] },
            installs: {
              experienceengine: {
                source: "path",
                sourcePath: "fixture-source",
                installPath
              }
            }
          });
        }
        return "";
      }
    })).toThrow("installed closure mismatch");
    expect(readFileSync(marker, "utf8")).toBe("old-working-version");
    expect(readFileSync(paths.installStatePath, "utf8")).toBe("old-install-state");
  });

  it("restores an existing npm plugin when upgrade is interrupted after candidate replacement", () => {
    const homeDir = makeTempDir();
    const installPath = join(homeDir, ".openclaw", "extensions", "experienceengine");
    const marker = join(installPath, "version.txt");
    mkdirSync(installPath, { recursive: true });
    writeFileSync(marker, "old-working-version", "utf8");
    const paths = resolveExperienceEnginePaths({ adapter: "openclaw", homeDir });
    mkdirSync(dirname(paths.installStatePath), { recursive: true });
    writeFileSync(paths.installStatePath, "old-upgrade-state", "utf8");

    expect(() => installOpenClawAdapter({
      homeDir,
      packageSourceBuilder() {
        return join(homeDir, "tmp", "candidate.tgz");
      },
      runner(command) {
        const key = [command.bin, ...command.args].join(" ");
        if (key === "openclaw config get plugins") {
          return JSON.stringify({
            load: { paths: [] },
            installs: {
              experienceengine: {
                source: "npm",
                spec: "@alan512/experienceengine",
                installPath
              }
            }
          });
        }
        if (key === "openclaw plugins update experienceengine") {
          writeFileSync(marker, "partially-installed-candidate", "utf8");
          return "updated";
        }
        if (key.startsWith("openclaw config set plugins.entries.experienceengine.config")) {
          throw new Error("simulated interrupted upgrade");
        }
        return "";
      }
    })).toThrow("simulated interrupted upgrade");
    expect(readFileSync(marker, "utf8")).toBe("old-working-version");
    expect(readFileSync(paths.installStatePath, "utf8")).toBe("old-upgrade-state");
  });
});
