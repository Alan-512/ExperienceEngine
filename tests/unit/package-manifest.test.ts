import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..", "..");

describe("package manifest", () => {
  it("uses a publish-safe bin entry for ee", () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      bin?: Record<string, string>;
    };

    expect(packageJson.bin?.ee).toBe("dist/cli/index.js");
  });
});
