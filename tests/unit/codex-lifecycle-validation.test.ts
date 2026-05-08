import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { runCodexLifecycleValidation } from "../../src/evaluation/codex-lifecycle-validation.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-codex-lifecycle-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length) {
    removeTempDirForTests(tempDirs.pop()!);
  }
});

describe("runCodexLifecycleValidation", () => {
  it("drives the Codex lifecycle deterministically and persists postmortem governance evidence", async () => {
    const outputDir = makeTempDir();

    const result = await runCodexLifecycleValidation({
      repoRoot: "/repo",
      outputDir,
      now: () => "2026-04-11T10:00:00.000Z"
    });

    expect(result.outputDir).toBe(outputDir);
    expect(result.report.lookup).toMatchObject({
      mode: "inject",
      injectedNodeIds: ["node_codex_lifecycle_validation"],
      deliveryMode: "live",
      delivered: true
    });
    expect(result.report.finalize).toMatchObject({
      status: "finalized",
      outcomeSignal: "success",
      recordedToolEvents: 1
    });
    expect(result.report.persistence).toMatchObject({
      taskRunCount: 1,
      injectionEventCount: 1,
      reviewEventCount: 2,
      hybridArtifactCount: 1,
      hybridTraceCount: 1
    });
    expect(result.report.persistence.reviewEventTypes).toEqual(["mark_uncertain", "mark_helped"]);
    expect(result.report.node).toMatchObject({
      id: "node_codex_lifecycle_validation",
      state: "active",
      deliveryState: "eligible",
      usageCount: 1,
      helpedCount: 1,
      harmedCount: 0,
      lastFeedbackVerdict: "helped"
    });
    expect(existsSync(result.jsonPath)).toBe(true);
    expect(existsSync(result.markdownPath)).toBe(true);
    expect(readFileSync(result.markdownPath, "utf8")).toContain("Codex lifecycle validation");
    expect(readFileSync(result.markdownPath, "utf8")).toContain("node_codex_lifecycle_validation");
  });
});
