import { createId } from "../utils/ids.js";
import type { TrajectoryExpectation, CompiledTrajectoryExpectations, TrajectoryExpectationType, ExpectationActionType } from "../types/domain.js";
import { CommandNormalizer } from "./command-normalizer.js";

export class TrajectoryCompiler {
  public static cleanStepProse(step: string): string {
    if (!step) return "";
    return step
      .replace(/^[\s\-\*\u2022\d\.\)]+/, "")
      .trim();
  }

  /**
   * Compiles a single step prose into a TrajectoryExpectation structure.
   */
  public static compileStep(stepProse: string, type: TrajectoryExpectationType): TrajectoryExpectation {
    const originalStep = stepProse.trim();
    const cleanStep = this.cleanStepProse(originalStep);
    const id = createId("exp");

    // 1. Check for command features
    // Match package manager followed by run/exec
    const pkgManagerRegex = /\b(pnpm|npm|yarn|bun|npx)\s+(run|exec)\s+([a-zA-Z0-9_\-\.\/]+)/i;
    const pkgManagerMatch = cleanStep.match(pkgManagerRegex);
    
    let commandMatch = pkgManagerMatch;
    let isPkgManager = false;
    
    if (pkgManagerMatch) {
      isPkgManager = true;
    } else {
      // Match common executables (pnpm, npm, git, tsc, vitest, docker, etc.)
      const commandRegex = /\b(pnpm|npm|yarn|bun|npx|git|tsc|vitest|jest|mocha|eslint|prettier|vite|next|docker)\b\s*([a-zA-Z0-9_\-\.\/]+)?/i;
      commandMatch = cleanStep.match(commandRegex);
    }

    if (commandMatch) {
      const exe = commandMatch[1]?.toLowerCase();
      const sub = commandMatch[2]?.toLowerCase() || "";
      const rawExtracted = commandMatch[0];

      const norm = CommandNormalizer.normalizeCommand(rawExtracted);
      const commandFamily = norm.commandFamily || exe;
      const subcommand = norm.subcommand || (sub && !sub.startsWith("-") ? sub : undefined);
      
      const commandPattern = subcommand 
        ? `${commandFamily} ${subcommand}`
        : commandFamily;

      return {
        id,
        type,
        actionType: "command",
        toolNamePattern: "run_command|bash|execute_command|terminal|sh",
        commandPattern,
        originalStep,
        ordered: type === "recommend" // Recommended commands are ordered; avoid commands check globally
      };
    }

    // 2. Check for file / artifact manipulation features
    // Match file extensions or edit verbs + files
    const fileVerbRegex = /\b(edit|modify|write|create|touch|update|delete|remove|read|view|inspect)\s+([a-zA-Z0-9_\-\.\/\\\*]+\.[a-zA-Z0-9]+)/i;
    const fileVerbMatch = cleanStep.match(fileVerbRegex);

    const genericFileRegex = /\b([a-zA-Z0-9_\-\.\/\\\*]+\.([a-zA-Z0-9]+))\b/;
    const genericFileMatch = cleanStep.match(genericFileRegex);

    if (fileVerbMatch) {
      const filePath = fileVerbMatch[2] || "";
      const ext = CommandNormalizer.getExtension(filePath) || "ts";
      
      return {
        id,
        type,
        actionType: "artifact",
        artifactPattern: ext,
        originalStep,
        ordered: false // Artifact touches can happen in any order
      };
    } else if (genericFileMatch) {
      const ext = genericFileMatch[2] || "";
      // Exclude false positives like common words (e.g. e.g. or i.e.)
      if (ext && !["eg", "ie", "md", "txt"].includes(ext.toLowerCase())) {
        return {
          id,
          type,
          actionType: "artifact",
          artifactPattern: ext.toLowerCase(),
          originalStep,
          ordered: false
        };
      }
    }

    // 3. Fallback to generic action type
    return {
      id,
      type,
      actionType: "generic",
      originalStep,
      ordered: false
    };
  }

  /**
   * Compiles recommended_steps, avoid_steps, success_signal, stop_condition, and escalation_condition of an ExperienceNode into CompiledTrajectoryExpectations.
   */
  public static compileNodeExpectations(
    recommendedSteps?: string[],
    avoidSteps?: string[],
    successSignal?: string,
    stopCondition?: string,
    escalationCondition?: string
  ): CompiledTrajectoryExpectations {
    const orderedExpectations: TrajectoryExpectation[] = [];
    const unorderedExpectations: TrajectoryExpectation[] = [];

    // Compile recommended steps
    if (recommendedSteps && Array.isArray(recommendedSteps)) {
      for (const step of recommendedSteps) {
        if (!step.trim()) continue;
        const exp = this.compileStep(step, "recommend");
        if (exp.ordered) {
          orderedExpectations.push(exp);
        } else {
          unorderedExpectations.push(exp);
        }
      }
    }

    // Compile avoid steps
    if (avoidSteps && Array.isArray(avoidSteps)) {
      for (const step of avoidSteps) {
        if (!step.trim()) continue;
        const exp = this.compileStep(step, "avoid");
        // Avoid step expectations are ALWAYS unordered because they trigger non-adoption violations globally
        unorderedExpectations.push({
          ...exp,
          ordered: false
        });
      }
    }

    // Compile success_signal
    if (successSignal && successSignal.trim()) {
      const exp = this.compileStep(successSignal, "recommend");
      unorderedExpectations.push({
        ...exp,
        id: exp.id.replace("exp_", "success_"),
        ordered: false
      });
    }

    // Compile stop_condition
    if (stopCondition && stopCondition.trim()) {
      const exp = this.compileStep(stopCondition, "avoid");
      unorderedExpectations.push({
        ...exp,
        ordered: false
      });
    }

    // Compile escalation_condition
    if (escalationCondition && escalationCondition.trim()) {
      const exp = this.compileStep(escalationCondition, "avoid");
      unorderedExpectations.push({
        ...exp,
        ordered: false
      });
    }

    return {
      orderedExpectations,
      unorderedExpectations
    };
  }
}
