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
      expect(resA.verdict).toBe("guidance_prevented_failure");
      expect(resA.confidence).toBe("high");
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
      // Since one of the ordered recommendations is missing, it's adoption/non_adoption
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
      expect(res.verdict).toBe("guidance_prevented_failure");
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
      expect(res.verdict).toBe("guidance_prevented_failure");
      expect(res.confidence).toBe("high");
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
      expect(res.verdict).toBe("guidance_prevented_failure");
      expect(res.confidence).toBe("high");
    });

    it("should fuzzy match via substring fallback for spacing or underscores mismatch", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(["npm run_build"], []);

      const events: ToolEvent[] = [
        { event_id: "e1", tool_name: "sh", input_summary: "npm run build", status: "success", started_at: "2026-05-20" }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("guidance_prevented_failure");
      expect(res.confidence).toBe("high");
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
      
      // Case A: No avoid action was taken, outcome is success -> guidance_prevented_failure
      const eventsA: ToolEvent[] = [
        { event_id: "e1", tool_name: "run_command", input_summary: "pnpm build", status: "success", started_at: "2026-05-20" }
      ];
      const resA = TrajectoryMatcher.match(compiled, eventsA, "success");
      expect(resA.verdict).toBe("guidance_prevented_failure");
      expect(resA.confidence).toBe("high");

      // Case B: No avoid action was taken, outcome is failure -> adoption_detected
      const resB = TrajectoryMatcher.match(compiled, eventsA, "failure");
      expect(resB.verdict).toBe("adoption_detected");
      expect(resB.confidence).toBe("medium");
    });
  });

  describe("Artifact & Generic Prose Fuzzy Matching", () => {
    it("should match file artifact extensions and names accurately", () => {
      // Expectation artifact pattern compiles to "ts" extension filter
      const compiled = TrajectoryCompiler.compileNodeExpectations(["modify index.ts"], []);

      const events: ToolEvent[] = [
        { event_id: "e1", tool_name: "write_to_file", input_summary: "src/main.ts", status: "success", started_at: "2026-05-20" }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("guidance_prevented_failure");
      expect(res.confidence).toBe("high");
    });

    it("should match generic prose fuzzy overlaps by keywords criteria", () => {
      const compiled = TrajectoryCompiler.compileNodeExpectations(["Ensure all routing configuration is fully validated"], []);

      // Timeline has event that overlaps on key words: "routing", "configuration", "validated"
      const events: ToolEvent[] = [
        { event_id: "e1", tool_name: "write_to_file", input_summary: "Updating the routing configuration structure", status: "success", started_at: "2026-05-20" }
      ];

      const res = TrajectoryMatcher.match(compiled, events, "success");
      expect(res.verdict).toBe("guidance_prevented_failure");
      expect(res.confidence).toBe("high");
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
      // And the success_signal (prefixed with success_) is correctly omitted from standard must-match recommends constraint to prevent false alarms.
      expect(res.verdict).toBe("guidance_prevented_failure");
      expect(res.confidence).toBe("high");
      expect(res.matchedExpectationIds.length).toBe(2); // Both the step and success_signal matched
      expect(res.violatedExpectationIds.length).toBe(0);
    });
  });
});
