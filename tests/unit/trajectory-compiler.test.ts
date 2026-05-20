import { describe, it, expect } from "vitest";
import { CommandNormalizer } from "../../src/compiler/command-normalizer.js";
import { TrajectoryCompiler } from "../../src/compiler/trajectory-compiler.js";
import type { ToolEvent } from "../../src/types/domain.js";

describe("Trajectory Expectation Compiler & Normalizer Tests", () => {
  describe("CommandNormalizer Volatile Redaction", () => {
    it("should redact Windows absolute paths with backslashes and forward slashes", () => {
      const cmd1 = "node C:\\Users\\123\\AppData\\Local\\Temp\\index.js --help";
      const cmd2 = "node d:/project/ExperienceEngine/src/main.ts --verbose";
      
      expect(CommandNormalizer.redactVolatileTokens(cmd1)).toBe("node [PATH] --help");
      expect(CommandNormalizer.redactVolatileTokens(cmd2)).toBe("node [PATH] --verbose");
    });

    it("should redact Unix absolute paths", () => {
      const cmd = "cat /home/runner/work/ExperienceEngine/package.json";
      expect(CommandNormalizer.redactVolatileTokens(cmd)).toBe("cat [PATH]");
    });

    it("should redact typical UUIDs and port numbers", () => {
      const cmd = "curl http://localhost:8080/api/v1/task/31d730ea-f836-405e-b8db-9891f8b3b655/status";
      expect(CommandNormalizer.redactVolatileTokens(cmd)).toBe(
        "curl http://localhost:[PORT]/api/v1/task/[UUID]/status"
      );
    });

    it("should redact branch names and git checkout branch arguments", () => {
      const cmd1 = "git checkout feature/issue-102";
      const cmd2 = "git switch -b bugfix/fix-auth";
      
      expect(CommandNormalizer.redactVolatileTokens(cmd1)).toBe("git checkout [BRANCH]");
      expect(CommandNormalizer.redactVolatileTokens(cmd2)).toBe("git switch -b [BRANCH]");
    });
  });

  describe("CommandNormalizer Command & Event Normalization", () => {
    it("should extract commandFamily and subcommand for package managers", () => {
      const res1 = CommandNormalizer.normalizeCommand("pnpm test tests/unit/foo.test.ts");
      const res2 = CommandNormalizer.normalizeCommand("npm run build --config production");
      
      expect(res1.commandFamily).toBe("pnpm");
      expect(res1.subcommand).toBe("test");
      
      expect(res2.commandFamily).toBe("npm");
      expect(res2.subcommand).toBe("run_build");
    });

    it("should extract commandFamily and subcommand for git", () => {
      const res = CommandNormalizer.normalizeCommand("git commit -m 'feat: logic'");
      expect(res.commandFamily).toBe("git");
      expect(res.subcommand).toBe("commit");
    });

    it("should extract artifact extension and name for host file tools", () => {
      const event: ToolEvent = {
        event_id: "t1",
        tool_name: "replace_file_content",
        input_summary: "d:\\project\\ExperienceEngine\\src\\types\\domain.ts",
        status: "success",
        started_at: "2026-05-20"
      };

      const norm = CommandNormalizer.normalizeToolEvent(event);
      expect(norm.toolName).toBe("replace_file_content");
      expect(norm.artifactName).toBe("domain.ts");
      expect(norm.artifactExtension).toBe("ts");
      expect(norm.normalizedInput).toBe("[PATH]");
    });
  });

  describe("TrajectoryCompiler Parsing", () => {
    it("should compile recommended command steps into ordered expectations", () => {
      const steps = [
        "1. git checkout -b my-branch",
        "- Run pnpm test to verify the fix",
        "  * touch src/index.ts to trigger compilation"
      ];

      const compiled = TrajectoryCompiler.compileNodeExpectations(steps, []);
      
      // Recommended commands are ordered: true
      expect(compiled.orderedExpectations.length).toBe(2);
      expect(compiled.orderedExpectations[0]?.actionType).toBe("command");
      expect(compiled.orderedExpectations[0]?.commandPattern).toBe("git checkout");
      expect(compiled.orderedExpectations[0]?.ordered).toBe(true);

      expect(compiled.orderedExpectations[1]?.actionType).toBe("command");
      expect(compiled.orderedExpectations[1]?.commandPattern).toBe("pnpm test");
      
      // Recommended files/artifacts are ordered: false
      expect(compiled.unorderedExpectations.length).toBe(1);
      expect(compiled.unorderedExpectations[0]?.actionType).toBe("artifact");
      expect(compiled.unorderedExpectations[0]?.artifactPattern).toBe("src/index.ts");
      expect(compiled.unorderedExpectations[0]?.ordered).toBe(false);
    });

    it("should compile avoid steps into unordered expectations with type avoid", () => {
      const avoid = [
        "do not run pnpm build before test",
        "avoid modifying package.json directly"
      ];

      const compiled = TrajectoryCompiler.compileNodeExpectations([], avoid);
      
      expect(compiled.orderedExpectations.length).toBe(0);
      expect(compiled.unorderedExpectations.length).toBe(2);
      
      expect(compiled.unorderedExpectations[0]?.type).toBe("avoid");
      expect(compiled.unorderedExpectations[0]?.actionType).toBe("command");
      expect(compiled.unorderedExpectations[0]?.commandPattern).toBe("pnpm build");
      expect(compiled.unorderedExpectations[0]?.ordered).toBe(false);

      expect(compiled.unorderedExpectations[1]?.type).toBe("avoid");
      expect(compiled.unorderedExpectations[1]?.actionType).toBe("artifact");
      expect(compiled.unorderedExpectations[1]?.artifactPattern).toBe("package.json");
      expect(compiled.unorderedExpectations[1]?.ordered).toBe(false);
    });

    it("should fallback to generic expectations gracefully for complex prose step descriptions", () => {
      const complexProse = [
        "Please check the alignment of the buttons under the profile page layout",
        "Ensure all constraints are met before continuing"
      ];

      const compiled = TrajectoryCompiler.compileNodeExpectations(complexProse, []);
      expect(compiled.orderedExpectations.length).toBe(0);
      expect(compiled.unorderedExpectations.length).toBe(2);
      
      expect(compiled.unorderedExpectations[0]?.actionType).toBe("generic");
      expect(compiled.unorderedExpectations[0]?.originalStep).toBe(complexProse[0]);
      
      expect(compiled.unorderedExpectations[1]?.actionType).toBe("generic");
      expect(compiled.unorderedExpectations[1]?.originalStep).toBe(complexProse[1]);
    });

    it("should compile all 5 core guidance fields including success_signal, stop_condition, and escalation_condition", () => {
      const steps = ["pnpm test"];
      const avoid = ["git reset --hard"];
      const success = "Build succeeds perfectly";
      const stop = "Exit if port is in use";
      const escalation = "Escalate if out of memory";

      const compiled = TrajectoryCompiler.compileNodeExpectations(steps, avoid, success, stop, escalation);

      // Verify ordered expectations (only recommended command steps are ordered)
      expect(compiled.orderedExpectations.length).toBe(1);
      expect(compiled.orderedExpectations[0]?.commandPattern).toBe("pnpm test");
      expect(compiled.orderedExpectations[0]?.ordered).toBe(true);

      // Verify unordered expectations: 1 avoid command + 3 compiled fields (all unordered)
      // success_signal -> recommend (unordered)
      // stop_condition -> avoid (unordered)
      // escalation_condition -> avoid (unordered)
      expect(compiled.unorderedExpectations.length).toBe(4);

      const avoidExp = compiled.unorderedExpectations.find(e => e.originalStep.includes("reset"));
      expect(avoidExp?.type).toBe("avoid");
      expect(avoidExp?.actionType).toBe("command");
      expect(avoidExp?.commandPattern).toBe("git reset");
      expect(avoidExp?.ordered).toBe(false);

      const successExp = compiled.unorderedExpectations.find(e => e.originalStep.includes("perfect"));
      expect(successExp?.type).toBe("recommend");
      expect(successExp?.actionType).toBe("generic");
      expect(successExp?.ordered).toBe(false);

      const stopExp = compiled.unorderedExpectations.find(e => e.originalStep.includes("Exit"));
      expect(stopExp?.type).toBe("avoid");
      expect(stopExp?.actionType).toBe("generic");
      expect(stopExp?.ordered).toBe(false);

      const escalationExp = compiled.unorderedExpectations.find(e => e.originalStep.includes("memory"));
      expect(escalationExp?.type).toBe("avoid");
      expect(escalationExp?.actionType).toBe("generic");
      expect(escalationExp?.ordered).toBe(false);
    });

    it("should capture advanced package manager command patterns (npm run / pnpm exec) and decouple toolNamePattern", () => {
      const steps = [
        "Run npm run build --config production",
        "avoid pnpm exec tsc --noEmit"
      ];

      const compiled = TrajectoryCompiler.compileNodeExpectations(steps, []);
      
      expect(compiled.orderedExpectations.length).toBe(2);
      expect(compiled.orderedExpectations[0]?.actionType).toBe("command");
      expect(compiled.orderedExpectations[0]?.commandPattern).toBe("npm run_build");
      expect(compiled.orderedExpectations[0]?.toolNamePattern).toBe("run_command|bash|execute_command|terminal|sh");
      expect(compiled.orderedExpectations[0]?.ordered).toBe(true);

      expect(compiled.orderedExpectations[1]?.actionType).toBe("command");
      expect(compiled.orderedExpectations[1]?.commandPattern).toBe("pnpm exec_tsc");
      expect(compiled.orderedExpectations[1]?.toolNamePattern).toBe("run_command|bash|execute_command|terminal|sh");
      expect(compiled.orderedExpectations[1]?.ordered).toBe(true);
    });
  });
});
