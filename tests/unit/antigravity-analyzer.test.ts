import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { parseArtifactContent, analyzeWorkspaceArtifacts } from "../../src/adapters/antigravity/artifact-analyzer.js";
import { removeTempDirForTests } from "./temp-cleanup.js";

const tempDirs: string[] = [];
const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-analyzer-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      removeTempDirForTests(dir);
    }
  }
});

describe("Artifact-Assisted Attribution Analyzer", () => {
  describe("parseArtifactContent", () => {
    it("extracts task status statistics from task checkboxes", () => {
      const markdown = `
# Task List
- [x] Task 1 completed
- [ ] Task 2 pending
* [/] Task 3 in progress
- \`[x]\` Task 4 wrapped checkbox
      `;

      const result = parseArtifactContent(markdown, "task.md");
      expect(result.evidence.tasksTotal).toBe(4);
      expect(result.evidence.tasksCompleted).toBe(2);
      expect(result.verificationStatus).toBe("unverified");
    });

    it("parses explicit verification verdicts: passed", () => {
      const markdown = `
# Walkthrough
Verification status: passed
- [x] Code builds
      `;

      const result = parseArtifactContent(markdown, "walkthrough.md");
      expect(result.verificationStatus).toBe("passed");
      expect(result.evidence.verdicts).toEqual([
        { file: "walkthrough.md", line: "Verification status: passed", verdict: "passed" }
      ]);
    });

    it("parses checkbox verification verdicts: failed", () => {
      const markdown = `
# Walkthrough
- [x] failed manual validation
      `;

      const result = parseArtifactContent(markdown, "walkthrough.md");
      expect(result.verificationStatus).toBe("failed");
      expect(result.evidence.verdicts).toEqual([
        { file: "walkthrough.md", line: "- [x] failed manual validation", verdict: "failed" }
      ]);
    });

    it("defaults to passed if all tasks are complete and no failure verdict exists", () => {
      const markdown = `
# Task list
- [x] Step 1
- [x] Step 2
      `;

      const result = parseArtifactContent(markdown, "task.md");
      expect(result.verificationStatus).toBe("passed");
    });

    it("detects ExperienceEngine nodes, references, and session UUIDs", () => {
      const markdown = `
Session ID: 4125b290-7cb5-4b10-8bde-d2325c787ab4
Matched node: node_codex_auth_failure_fixed
Telemetry: experienceengine://vector/node-123
Calls experienceengine_lookup_hints.
      `;

      const result = parseArtifactContent(markdown, "walkthrough.md");
      expect(result.evidence.hasExperienceEngineRefs).toBe(true);
      expect(result.evidence.sessionIds).toContain("4125b290-7cb5-4b10-8bde-d2325c787ab4");
      expect(result.evidence.experienceRefs).toContain("node_codex_auth_failure_fixed");
      expect(result.evidence.experienceRefs).toContain("experienceengine://vector/node-123");
    });
  });

  describe("analyzeWorkspaceArtifacts", () => {
    it("collects aggregate statistics across multiple planning files in a workspace", () => {
      const tempDir = makeTempDir();

      const taskMd = `
- [x] Task 1
- [ ] Task 2
      `;

      const walkthroughMd = `
Verification: passed
Experience refs: node_test_aggregate
      `;

      const planMd = `
- [x] Plan item 1
Session: 96ff6be9-3351-40c2-b364-7bf5fca446e1
      `;

      writeFileSync(join(tempDir, "task.md"), taskMd, "utf8");
      writeFileSync(join(tempDir, "walkthrough.md"), walkthroughMd, "utf8");
      writeFileSync(join(tempDir, "implementation_plan.md"), planMd, "utf8");

      const result = analyzeWorkspaceArtifacts(tempDir);

      expect(result.verificationStatus).toBe("passed");
      expect(result.evidence.tasksTotal).toBe(3);
      expect(result.evidence.tasksCompleted).toBe(2);
      expect(result.evidence.experienceRefs).toContain("node_test_aggregate");
      expect(result.evidence.sessionIds).toContain("96ff6be9-3351-40c2-b364-7bf5fca446e1");
    });

    it("lets failed verification status take precedence over passed", () => {
      const tempDir = makeTempDir();

      const taskMd = `
Verification: passed
      `;

      const walkthroughMd = `
Verification: failed
      `;

      writeFileSync(join(tempDir, "task.md"), taskMd, "utf8");
      writeFileSync(join(tempDir, "walkthrough.md"), walkthroughMd, "utf8");

      const result = analyzeWorkspaceArtifacts(tempDir, ["task.md", "walkthrough.md"]);
      expect(result.verificationStatus).toBe("failed");
    });
  });
});
