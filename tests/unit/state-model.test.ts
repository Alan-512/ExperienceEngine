import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { inspectSharedSetupState } from "../../src/cli/state-model.js";

const tempDirs: string[] = [];
const originalHome = process.env.EXPERIENCE_ENGINE_HOME;

const makeProductHome = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-state-model-"));
  const productHome = join(dir, ".experienceengine");
  mkdirSync(productHome, { recursive: true });
  tempDirs.push(dir);
  process.env.EXPERIENCE_ENGINE_HOME = productHome;
  return productHome;
};

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  if (originalHome === undefined) {
    delete process.env.EXPERIENCE_ENGINE_HOME;
  } else {
    process.env.EXPERIENCE_ENGINE_HOME = originalHome;
  }
});

describe("state model", () => {
  it("does not treat cosmetic settings as shared initialization", () => {
    const productHome = makeProductHome();
    writeFileSync(join(productHome, "settings.json"), JSON.stringify({ notices: { inline: false } }));

    expect(inspectSharedSetupState()).toEqual({ initialized: false });
  });

  it("does not treat a secret-only setup as shared initialization", () => {
    const productHome = makeProductHome();
    writeFileSync(join(productHome, "secrets.json"), JSON.stringify({ GEMINI_API_KEY: "test-key" }));

    expect(inspectSharedSetupState()).toEqual({ initialized: false });
  });

  it("requires both distillation provider and model to count as initialized", () => {
    const productHome = makeProductHome();
    writeFileSync(join(productHome, "settings.json"), JSON.stringify({ distillation: { provider: "gemini" } }));

    expect(inspectSharedSetupState()).toEqual({ initialized: false });

    writeFileSync(
      join(productHome, "settings.json"),
      JSON.stringify({ distillation: { provider: "gemini", model: "gemini-3.1-flash-lite-preview" } })
    );

    expect(inspectSharedSetupState()).toEqual({ initialized: true });
  });
});
