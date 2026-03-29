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
    expect(packageJson.version).toBe("0.1.3");
    expect(packageJson.bin?.ee).toBe("dist/cli/index.js");
  });
});
