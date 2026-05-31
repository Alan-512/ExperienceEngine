import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..", "..");

describe("package manifest", () => {
  it("uses the scoped npm package name, current release version, and a publish-safe bin entry for ee", () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      name?: string;
      version?: string;
      bin?: Record<string, string>;
    };

    expect(packageJson.name).toBe("@alan512/experienceengine");
    expect(packageJson.version).toBe("0.4.5");
    expect(packageJson.bin?.ee).toBe("dist/cli/index.js");
  });

  it("declares the OpenClaw compatibility metadata required for external code-plugin publishing", () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      openclaw?: {
        compat?: {
          pluginApi?: string;
          minGatewayVersion?: string;
        };
        build?: {
          openclawVersion?: string;
          pluginSdkVersion?: string;
        };
      };
    };

    expect(packageJson.openclaw?.compat?.pluginApi).toBe(">=2026.4.1");
    expect(packageJson.openclaw?.compat?.minGatewayVersion).toBe("2026.4.1");
    expect(packageJson.openclaw?.build?.openclawVersion).toBe("2026.4.1");
    expect(packageJson.openclaw?.build?.pluginSdkVersion).toBe("2026.4.1");
  });
});
