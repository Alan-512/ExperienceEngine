import { mkdtempSync, mkdirSync, rmSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  filterExperienceEngineLoadPaths,
  normalizeTreePermissions
} from "../../src/install/openclaw-installer.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-warning-cleanup-"));
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
});

describe("OpenClaw warning cleanup helpers", () => {
  it("filters only ExperienceEngine-owned load paths", () => {
    const keep = "/tmp/other-plugin";
    const removeA = "/mnt/d/project/ExperienceEngine";
    const removeB = "/home/seed/openclaw-dev/ExperienceEngine-git";

    expect(filterExperienceEngineLoadPaths([keep, removeA, removeB])).toEqual([keep]);
  });

  it("normalizes copied install tree permissions recursively", () => {
    const root = makeTempDir();
    const nestedDir = join(root, "src", "plugin");
    const nestedFile = join(nestedDir, "openclaw-plugin.ts");

    mkdirSync(nestedDir, { recursive: true, mode: 0o777 });
    writeFileSync(nestedFile, "export default {};\n", { mode: 0o777 });

    normalizeTreePermissions(root);

    expect(statSync(root).mode & 0o777).toBe(0o755);
    expect(statSync(join(root, "src")).mode & 0o777).toBe(0o755);
    expect(statSync(nestedDir).mode & 0o777).toBe(0o755);
    expect(statSync(nestedFile).mode & 0o777).toBe(0o644);
  });
});
