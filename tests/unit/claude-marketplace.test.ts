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
        source: {
          source: string;
          package?: string;
          version?: string;
        };
      }>;
    };

    const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      name: string;
      version: string;
    };

    expect(marketplace.name).toBe("experienceengine");
    expect(marketplace.owner?.name).toBe("ExperienceEngine");
    expect(marketplace.plugins).toEqual([
      expect.objectContaining({
        name: "experienceengine",
        source: {
          source: "npm",
          package: packageJson.name,
          version: packageJson.version
        }
      })
    ]);
  });
});
