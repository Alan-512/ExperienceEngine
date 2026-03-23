import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..", "..");

describe("Claude marketplace assets", () => {
  it("defines a marketplace manifest that distributes the npm plugin package", () => {
    const marketplace = JSON.parse(
      readFileSync(join(repoRoot, ".claude-plugin", "marketplace.json"), "utf8")
    ) as {
      name: string;
      owner?: { name?: string };
      plugins: Array<{
        name: string;
        source: string;
      }>;
    };

    expect(marketplace.name).toBe("experienceengine");
    expect(marketplace.owner?.name).toBe("ExperienceEngine");
    expect(marketplace.plugins).toEqual([
      expect.objectContaining({
        name: "experienceengine",
        source: "./plugins/claude-code-experienceengine"
      })
    ]);
  });

  it("keeps the Claude plugin bundle in the published package file list", () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      files?: string[];
    };

    expect(packageJson.files).toEqual(
      expect.arrayContaining([".claude-plugin", "plugins/claude-code-experienceengine"])
    );
  });
});
