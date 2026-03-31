import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..", "..");

describe("OpenClaw plugin manifest", () => {
  it("tracks the current public release version", () => {
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, "openclaw.plugin.json"), "utf8")
    ) as {
      id?: string;
      name?: string;
      version?: string;
    };

    expect(manifest.id).toBe("experienceengine");
    expect(manifest.name).toBe("ExperienceEngine");
    expect(manifest.version).toBe("0.1.3");
  });

  it("declares hybrid phase1 and phase2 config fields for OpenClaw runtime wiring", () => {
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, "openclaw.plugin.json"), "utf8")
    ) as {
      configSchema?: {
        properties?: Record<string, unknown>;
      };
    };

    const properties = manifest.configSchema?.properties ?? {};

    expect(properties).toHaveProperty("hybridEnabled");
    expect(properties).toHaveProperty("hybridSyncExplainEnabled");
    expect(properties).toHaveProperty("hybridAsyncPostmortemEnabled");
    expect(properties).toHaveProperty("hybridExplainLlmEnabled");
    expect(properties).toHaveProperty("hybridExplainProviderMode");
    expect(properties).toHaveProperty("hybridExplainModelProfileVersion");
    expect(properties).toHaveProperty("distillerProvider");
    expect(properties).toHaveProperty("distillerModel");
  });
});
