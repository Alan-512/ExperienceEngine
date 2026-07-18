import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..", "..");

describe("OpenClaw plugin manifest", () => {
  it("tracks the package release version", () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      version?: string;
    };
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, "openclaw.plugin.json"), "utf8")
    ) as {
      id?: string;
      name?: string;
      version?: string;
      activation?: { onStartup?: boolean };
    };

    expect(manifest.id).toBe("experienceengine");
    expect(manifest.name).toBe("ExperienceEngine");
    expect(manifest.version).toBe(packageJson.version);
    expect(manifest.activation?.onStartup).toBe(true);
  });

  it("declares hybrid phase1, phase2, and phase3 config fields for OpenClaw runtime wiring", () => {
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
    expect(properties).toHaveProperty("hybridAsyncPostmortemLlmEnabled");
    expect(properties).toHaveProperty("hybridExplainLlmEnabled");
    expect(properties).toHaveProperty("hybridExplainProviderMode");
    expect(properties).toHaveProperty("hybridExplainModelProfileVersion");
    expect(properties).toHaveProperty("hybridPostmortemProviderMode");
    expect(properties).toHaveProperty("hybridPostmortemModelProfileVersion");
    expect(properties).toHaveProperty("distillerProvider");
    expect(properties).toHaveProperty("distillerModel");

    expect(JSON.stringify(properties.captureRawPayloads)).toContain(
      "may contain prompts, tool data, secrets"
    );
    expect(JSON.stringify(properties.distillerProvider)).toContain(
      "selected task content is sent"
    );
    expect(JSON.stringify(properties.hybridAsyncPostmortemLlmEnabled)).toContain(
      "Selected task evidence is sent"
    );
  });
});
