import { describe, it, expect } from "vitest";
import { TrajectoryCompiler } from "../../src/compiler/trajectory-compiler.js";
import { TrajectoryMatcher } from "../../src/compiler/trajectory-matcher.js";
import type { ToolEvent } from "../../src/types/domain.js";

describe("TrajectoryMatcher Engine Tests", () => {
  describe("Greedy Sequence Alignment for Ordered Recommendations", () => {
    it("should match ordered recommendations strictly sequentially", () => {
      const steps = [
        "1. git checkout -b feature-branch",
        "2. pnpm test",
        "3. git push origin feature-branch"
      ];
      const compiled = TrajectoryCompiler.compileNodeExpectations(steps, []);

      // Case A: Perfect ordered timeline
      const eventsA: ToolEvent[] = [
        { event_id: "e1", tool_name: "run_command", input_summary: "git checkout -b feature-branch", status: "success", started_at: "2026-05-20" },
        { event_id: "e2", tool_name: "run_command", input_summary: "pnpm test", status: "success", started_at: "2026-05-20" },
        { event_id: "e3", tool_name: "run_command", input_summary: "git push origin feature-branch", status: "success", started_at: "2026-05-20" }
      ];

      const resA = TrajectoryMatcher.match(compiled, eventsA, "success");
      // Standard recommended steps are adopted on success, but no success_signal defined -> adoption_detected
      expect(resA.verdict).toBe("adoption_detected");
      expect(resA.confidence).toBe("medium");
      expect(resA.matchedExpectationIds.length).toBe(3);
      expect(resA.violatedExpectationIds.length).toBe(0);
      expect(resA.evidenceRefs).toContain("e1");
      expect(resA.evidenceRefs).toContain("e2");
      expect(resA.evidenceRefs).toContain("e3");

      // Case B: Non-sequential timeline (skip pnpm test, directly push)
      const eventsB: ToolEvent[] = [
        { event_id: "e1", tool_name: "run_command", input_summary: "git checkout -b feature-branch", status: "success", started_at: "2026-05-20" },
        { event_id: "e3", tool_name: "run_command", input_summary: "git push origin feature-branch", status: "success", started_at: "2026-05-20" }
      ];

      const resB = TrajectoryMatcher.match(compiled, eventsB, "success");
      // Since one of the ordered recommendations is missing, it's non_adoption
      expect(resB.verdict).toBe("non_adoption_detected");
      expect(resB.confidence).toBe("medium"); // Partially matched (at least one recommend matched)
      expect(resB.matchedExpectationIds.length).toBe(2); // checkout and push matched
      expect(resB.violatedExpectationIds.length).toBe(1); // pnpm test violated
    });

    it("should handle greedy pointer advancement properly", () => {
      const steps = ["git commit", "git push"];
      const compiled = TrajectoryCompiler.compileNodeExpectations(steps, []);

      const events: ToolEvent[] = [
        { event_id: "e1", tool_name: "run_command", input_summary: "git push", status: "success", started_at: "2026-05-20" }, // Push first (out of order, cannot match yet)
        { event_id: "e2", tool_name: "run_command", input_summary: "git commit", status: "success", started_at: "2026-05-20" }, // Matches commit
        { event_id: "e3", tool_name: "run_command", input_summary: "git push", status: "success", started_at: "2026-05-20" }  // Matches push since pointer is advanced
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("adoption_detected");
      expect(res.matchedExpectationIds.length).toBe(2);
      expect(res.violatedExpectationIds.length).toBe(0);
    });
  });

  describe("Avoid Step Violations & Causal Harm vs Contra-Adoption", () => {
    const avoidSteps = ["avoid running npm run dev", "avoid modifying index.css"];
    const compiled = TrajectoryCompiler.compileNodeExpectations([], avoidSteps);

    it("should identify avoid step violation on successful run as contra_adoption_detected", () => {
      const events: ToolEvent[] = [
        { event_id: "e1", tool_name: "run_command", input_summary: "npm run dev", status: "success", started_at: "2026-05-20" }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("contra_adoption_detected");
      expect(res.confidence).toBe("medium");
      expect(res.violatedExpectationIds.length).toBe(1);
      expect(res.evidenceRefs).toContain("e1");
    });

    it("should identify avoid step violation on failed run as contra_adoption_detected (medium) if NO direct causal harm evidence is found", () => {
      const events: ToolEvent[] = [
        { event_id: "e1", tool_name: "run_command", input_summary: "npm run dev", status: "success", started_at: "2026-05-20" },
        { event_id: "e2", tool_name: "run_command", input_summary: "vitest run", status: "failure", started_at: "2026-05-20" } // unrelated failure
      ];

      const res = TrajectoryMatcher.match(compiled, events, "failure");
      expect(res.verdict).toBe("contra_adoption_detected");
      expect(res.confidence).toBe("medium");
    });

    it("should identify guidance_caused_failure (high) if the avoid event itself failed", () => {
      const events: ToolEvent[] = [
        { event_id: "e1", tool_name: "run_command", input_summary: "npm run dev", status: "failure", started_at: "2026-05-20" } // the avoided action itself failed
      ];

      const res = TrajectoryMatcher.match(compiled, events, "failure");
      expect(res.verdict).toBe("guidance_caused_failure");
      expect(res.confidence).toBe("high");
    });

    it("should identify guidance_caused_failure (high) if a failed command in the timeline contains the avoided action's keywords", () => {
      const events: ToolEvent[] = [
        { event_id: "e1", tool_name: "run_command", input_summary: "npm run dev", status: "success", started_at: "2026-05-20" },
        { event_id: "e2", tool_name: "run_command", input_summary: "npm run dev --port 3000", status: "failure", started_at: "2026-05-20" } // contains npm run dev
      ];

      const res = TrajectoryMatcher.match(compiled, events, "failure");
      expect(res.verdict).toBe("guidance_caused_failure");
      expect(res.confidence).toBe("high");
    });
  });

  describe("Bash case-insensitive and npm run_build space/underscore fuzzing", () => {
    it("should match command pattern in Bash (case insensitive) tool execution", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(["pnpm test"], []);

      // tool_name: "Bash" (capital B) with "pnpm test"
      const events: ToolEvent[] = [
        { event_id: "e1", tool_name: "Bash", input_summary: "pnpm test --coverage", status: "success", started_at: "2026-05-20" }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("adoption_detected");
      expect(res.confidence).toBe("medium");
      expect(res.matchedExpectationIds.length).toBe(1);
    });

    it("should fuzzy match npm run_build expectation with npm run build event input", () => {
      // Expectation is "npm run_build" (since TrajectoryCompiler compiles it to "npm run_build")
      const compiled = TrajectoryCompiler.compileNodeExpectations(["npm run build"], []);

      // Event is terminal execution of "npm run build"
      const events: ToolEvent[] = [
        { event_id: "e1", tool_name: "execute_command", input_summary: "npm run build --config production", status: "success", started_at: "2026-05-20" }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("adoption_detected");
      expect(res.confidence).toBe("medium");
    });

    it("should fuzzy match via substring fallback for spacing or underscores mismatch", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(["npm run_build"], []);

      const events: ToolEvent[] = [
        { event_id: "e1", tool_name: "sh", input_summary: "npm run build", status: "success", started_at: "2026-05-20" }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("adoption_detected");
      expect(res.confidence).toBe("medium");
    });
  });

  describe("Global Verdict Decisions and Confidence Levels", () => {
    it("should return non_adoption_detected with low confidence when no recommended steps were matched", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(["pnpm test"], []);
      const events: ToolEvent[] = [
        { event_id: "e1", tool_name: "run_command", input_summary: "git commit -m 'unrelated'", status: "success", started_at: "2026-05-20" }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("non_adoption_detected");
      expect(res.confidence).toBe("low");
    });

    it("should return adoption_detected with medium confidence when recommends met but outcome is failure", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(["pnpm test"], []);
      const events: ToolEvent[] = [
        { event_id: "e1", tool_name: "run_command", input_summary: "pnpm test", status: "success", started_at: "2026-05-20" }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "failure");
      expect(res.verdict).toBe("adoption_detected");
      expect(res.confidence).toBe("medium");
    });

    it("should handle purely avoid expectations successfully", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations([], ["avoid npm run dev"]);
      
      // Case A: No avoid action was taken, outcome is success -> adoption_detected (no explicit success_signal to upgrade)
      const eventsA: ToolEvent[] = [
        { event_id: "e1", tool_name: "run_command", input_summary: "pnpm build", status: "success", started_at: "2026-05-20" }
      ];
      const resA = TrajectoryMatcher.match(compiled, eventsA, "success");
      expect(resA.verdict).toBe("adoption_detected");
      expect(resA.confidence).toBe("medium");

      // Case B: No avoid action was taken, outcome is failure -> adoption_detected
      const resB = TrajectoryMatcher.match(compiled, eventsA, "failure");
      expect(resB.verdict).toBe("adoption_detected");
      expect(resB.confidence).toBe("medium");
    });
  });

  describe("Artifact & Generic Prose Fuzzy Matching", () => {
    it("should match file artifact extensions and names accurately", () => {
      // 1. Precise filename match
      const compiledFile = TrajectoryCompiler.compileNodeExpectations(["modify index.ts"], []);
      const eventsFile: ToolEvent[] = [
        { event_id: "e1", tool_name: "write_to_file", input_summary: "src/index.ts", status: "success", started_at: "2026-05-20" }
      ];
      const resFile = TrajectoryMatcher.match(compiledFile, eventsFile, "success");
      expect(resFile.verdict).toBe("adoption_detected");

      // 2. Wildcard/extension match
      const compiledExt = TrajectoryCompiler.compileNodeExpectations(["modify *.ts"], []);
      const eventsExt: ToolEvent[] = [
        { event_id: "e2", tool_name: "write_to_file", input_summary: "src/main.ts", status: "success", started_at: "2026-05-20" }
      ];
      const resExt = TrajectoryMatcher.match(compiledExt, eventsExt, "success");
      expect(resExt.verdict).toBe("adoption_detected");
    });

    it("should match generic prose fuzzy overlaps by keywords criteria", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(["Ensure all routing configuration is fully validated"], []);

      // Timeline has event that overlaps on key words: "routing", "configuration", "validated"
      const events: ToolEvent[] = [
        { event_id: "e1", tool_name: "write_to_file", input_summary: "Updating the routing configuration structure", status: "success", started_at: "2026-05-20" }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("adoption_detected");
      expect(res.confidence).toBe("medium");
    });
  });

  describe("P1 success_signal Output Summary Matching & False Alarm Gating", () => {
    it("should successfully match success_signal with tool output_summary and prevent false non_adoption", () => {
      // Setup matching the user's reproduction case:
      // recommended_steps=["pnpm test"], success_signal="The targeted test passes"
      const compiled = TrajectoryCompiler.compileNodeExpectations(
        ["pnpm test"], 
        [], 
        "The targeted test passes"
      );

      const events: ToolEvent[] = [
        { 
          event_id: "e1", 
          tool_name: "Bash", 
          input_summary: "pnpm test", 
          output_summary: "The targeted test passes", 
          status: "success", 
          started_at: "2026-05-20" 
        }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      
      // Verified: Recommended step met, success_signal successfully matched in output_summary.
      // With explicit success_signal defined and successfully met, verdict is correctly upgraded to guidance_prevented_failure!
      expect(res.verdict).toBe("guidance_prevented_failure");
      expect(res.confidence).toBe("high");
      expect(res.matchedExpectationIds.length).toBe(2); // Both the step and success_signal matched
      expect(res.violatedExpectationIds.length).toBe(0);
    });
  });

  describe("P1 trajectory_unknown Gating for Empty or Unsupported Events", () => {
    it("should return trajectory_unknown when events timeline is empty", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(["pnpm test"], []);
      const res = TrajectoryMatcher.match(compiled, [], "success");
      expect(res.verdict).toBe("trajectory_unknown");
      expect(res.confidence).toBe("low");
    });

    it("should return trajectory_unknown when events only contain unsupported tool formats", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(["pnpm test"], []);
      const events: ToolEvent[] = [
        { event_id: "e1", tool_name: "unsupported_custom_tool", input_summary: "some inputs", status: "success", started_at: "2026-05-20" }
      ];
      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("trajectory_unknown");
      expect(res.confidence).toBe("low");
    });
  });

  describe("P1 Only success_signal Nodes Matching", () => {
    it("should match success_signal and return guidance_prevented_failure when no recommends or avoids are defined", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations([], [], "The targeted test passes");
      const events: ToolEvent[] = [
        { 
          event_id: "e1", 
          tool_name: "Bash", 
          input_summary: "pnpm test", 
          output_summary: "The targeted test passes", 
          status: "success", 
          started_at: "2026-05-20" 
        }
      ];
      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("guidance_prevented_failure");
      expect(res.confidence).toBe("high");
    });

    it("should return non_adoption_detected when only success_signal is defined but fails to match in timeline", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations([], [], "The targeted test passes");
      const events: ToolEvent[] = [
        { 
          event_id: "e1", 
          tool_name: "Bash", 
          input_summary: "pnpm test", 
          output_summary: "some other output", 
          status: "success", 
          started_at: "2026-05-20" 
        }
      ];
      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("non_adoption_detected");
      expect(res.confidence).toBe("low");
    });
  });

  describe("P2 Completely Empty Trajectory Expectations", () => {
    it("should return trajectory_unknown when no expectations are defined regardless of timeline events", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations([], []);
      const events: ToolEvent[] = [
        { 
          event_id: "e1", 
          tool_name: "Bash", 
          input_summary: "pnpm test", 
          output_summary: "The targeted test passes", 
          status: "success", 
          started_at: "2026-05-20" 
        }
      ];
      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("trajectory_unknown");
      expect(res.confidence).toBe("low");
    });
  });

  describe("P1 apply_patch and write_file Support", () => {
    it("should match artifact expectations when tool_name is apply_patch or write_file", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(
        ["modify src/index.ts", "write src/main.ts"], 
        []
      );

      const events: ToolEvent[] = [
        { 
          event_id: "e1", 
          tool_name: "apply_patch", 
          input_summary: "src/index.ts", 
          status: "success", 
          started_at: "2026-05-20" 
        },
        { 
          event_id: "e2", 
          tool_name: "write_file", 
          input_summary: "src/main.ts", 
          status: "success", 
          started_at: "2026-05-20" 
        }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("adoption_detected");
      expect(res.confidence).toBe("medium");
      expect(res.matchedExpectationIds.length).toBe(2);
      expect(res.violatedExpectationIds.length).toBe(0);
    });
  });

  describe("P1 Artifact Read vs Write matching", () => {
    it("should NOT match modify/write steps when only read/view events occur", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(
        ["modify src/index.ts"],
        []
      );

      const events: ToolEvent[] = [
        {
          event_id: "e1",
          tool_name: "read_file",
          input_summary: "src/index.ts",
          status: "success",
          started_at: "2026-05-20"
        }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("non_adoption_detected");
      expect(res.matchedExpectationIds.length).toBe(0);
      expect(res.violatedExpectationIds.length).toBe(1);
    });

    it("should match modify/write steps when write/apply_patch events occur", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(
        ["modify src/index.ts"],
        []
      );

      const events: ToolEvent[] = [
        {
          event_id: "e1",
          tool_name: "apply_patch",
          input_summary: "src/index.ts",
          status: "success",
          started_at: "2026-05-20"
        }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("adoption_detected");
      expect(res.matchedExpectationIds.length).toBe(1);
      expect(res.violatedExpectationIds.length).toBe(0);
    });
  });

  describe("P2 Directory-Aware Artifact Matching", () => {
    it("should NOT match when directories do not align even if basenames match", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(
        ["modify src/index.ts"],
        []
      );

      const events: ToolEvent[] = [
        {
          event_id: "e1",
          tool_name: "apply_patch",
          input_summary: "other/index.ts",
          status: "success",
          started_at: "2026-05-20"
        }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("non_adoption_detected");
      expect(res.matchedExpectationIds.length).toBe(0);
      expect(res.violatedExpectationIds.length).toBe(1);
    });

    it("should match when directories align", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(
        ["modify src/index.ts"],
        []
      );

      const events: ToolEvent[] = [
        {
          event_id: "e1",
          tool_name: "apply_patch",
          input_summary: "src/index.ts",
          status: "success",
          started_at: "2026-05-20"
        }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("adoption_detected");
      expect(res.matchedExpectationIds.length).toBe(1);
      expect(res.violatedExpectationIds.length).toBe(0);
    });

    it("should match even when expectation has leading ./ and event has no leading ./", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(
        ["modify ./src/index.ts"],
        []
      );

      const events: ToolEvent[] = [
        {
          event_id: "e1",
          tool_name: "apply_patch",
          input_summary: "src/index.ts",
          status: "success",
          started_at: "2026-05-20"
        }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("adoption_detected");
      expect(res.matchedExpectationIds.length).toBe(1);
      expect(res.violatedExpectationIds.length).toBe(0);
    });

    it("should match even when event has leading ./ and expectation has no leading ./", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(
        ["modify src/index.ts"],
        []
      );

      const events: ToolEvent[] = [
        {
          event_id: "e1",
          tool_name: "apply_patch",
          input_summary: "./src/index.ts",
          status: "success",
          started_at: "2026-05-20"
        }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("adoption_detected");
      expect(res.matchedExpectationIds.length).toBe(1);
      expect(res.violatedExpectationIds.length).toBe(0);
    });

    it("should match directory-aware artifacts case-insensitively when event has uppercase/mixed-case path", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(
        ["modify src/index.ts"],
        []
      );

      const events: ToolEvent[] = [
        {
          event_id: "e1",
          tool_name: "apply_patch",
          input_summary: "SRC/Index.TS",
          status: "success",
          started_at: "2026-05-20"
        }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("adoption_detected");
      expect(res.matchedExpectationIds.length).toBe(1);
      expect(res.violatedExpectationIds.length).toBe(0);
    });

    it("should NOT match when event path contains expectation as substring but NOT at a directory boundary", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(
        ["modify lib/utils.ts"],
        []
      );

      const events: ToolEvent[] = [
        {
          event_id: "e1",
          tool_name: "apply_patch",
          input_summary: "mylib/utils.ts",
          status: "success",
          started_at: "2026-05-20"
        }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("non_adoption_detected");
      expect(res.matchedExpectationIds.length).toBe(0);
      expect(res.violatedExpectationIds.length).toBe(1);
    });

    it("should match when event path is a deeper nested directory containing the expectation as a proper suffix", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(
        ["modify src/index.ts"],
        []
      );

      const events: ToolEvent[] = [
        {
          event_id: "e1",
          tool_name: "apply_patch",
          input_summary: "packages/frontend/src/index.ts",
          status: "success",
          started_at: "2026-05-20"
        }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("adoption_detected");
      expect(res.matchedExpectationIds.length).toBe(1);
      expect(res.violatedExpectationIds.length).toBe(0);
    });

    it("should match directory-aware expectations against absolute paths at a proper boundary", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(
        ["modify src/config/settings.ts"],
        []
      );

      const events: ToolEvent[] = [
        {
          event_id: "e1",
          tool_name: "apply_patch",
          input_summary: "d:/project/ExperienceEngine/src/config/settings.ts",
          status: "success",
          started_at: "2026-05-20"
        }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("adoption_detected");
      expect(res.matchedExpectationIds.length).toBe(1);
      expect(res.violatedExpectationIds.length).toBe(0);
    });

    it("should match when input_summary is a JSON string containing a patch with target file markers", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(
        ["modify src/index.ts"],
        []
      );

      const events: ToolEvent[] = [
        {
          event_id: "e1",
          tool_name: "apply_patch",
          input_summary: JSON.stringify({
            patch: "*** Update File: src/index.ts\n--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,3 +1,4 @@"
          }),
          status: "success",
          started_at: "2026-05-20"
        }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("adoption_detected");
      expect(res.matchedExpectationIds.length).toBe(1);
      expect(res.violatedExpectationIds.length).toBe(0);
    });

    it("should match when input_summary is a raw patch string with markers", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(
        ["modify src/index.ts"],
        []
      );

      const events: ToolEvent[] = [
        {
          event_id: "e1",
          tool_name: "apply_patch",
          input_summary: "*** Update File: src/index.ts\n[Patch contents here]",
          status: "success",
          started_at: "2026-05-20"
        }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("adoption_detected");
      expect(res.matchedExpectationIds.length).toBe(1);
      expect(res.violatedExpectationIds.length).toBe(0);
    });

    it("should match when input_summary is a JSON string with key filePath", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(
        ["modify src/index.ts"],
        []
      );

      const events: ToolEvent[] = [
        {
          event_id: "e1",
          tool_name: "replace_file_content",
          input_summary: JSON.stringify({
            filePath: "src/index.ts",
            targetContent: "foo",
            replacementContent: "bar"
          }),
          status: "success",
          started_at: "2026-05-20"
        }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("adoption_detected");
      expect(res.matchedExpectationIds.length).toBe(1);
      expect(res.violatedExpectationIds.length).toBe(0);
    });

    it("should match multiple files correctly in a single multi-file patch", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(
        ["modify src/first.ts", "modify src/second.ts"],
        []
      );

      const events: ToolEvent[] = [
        {
          event_id: "e1",
          tool_name: "apply_patch",
          input_summary: JSON.stringify({
            patch: "*** Update File: src/first.ts\n...\n*** Add File: src/second.ts\n..."
          }),
          status: "success",
          started_at: "2026-05-20"
        }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("adoption_detected");
      expect(res.matchedExpectationIds.length).toBe(2);
      expect(res.violatedExpectationIds.length).toBe(0);
    });
  });
});

