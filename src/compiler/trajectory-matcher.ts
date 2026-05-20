import type { 
  ToolEvent, 
  NormalizedToolEvent, 
  CompiledTrajectoryExpectations, 
  TrajectoryExpectation,
  AttributionConfidence
} from "../types/domain.js";
import { CommandNormalizer } from "./command-normalizer.js";

export type TrajectoryMatchResult = {
  verdict: "adoption" | "non_adoption" | "contra_adoption" | "causal_success" | "causal_harm";
  confidence: AttributionConfidence;
  matchedExpectationIds: string[];
  violatedExpectationIds: string[];
  evidenceRefs: string[];
};

export class TrajectoryMatcher {
  /**
   * Main matching engine comparing compiled expectations against tool event timelines.
   */
  public static match(
    expectations: CompiledTrajectoryExpectations,
    events: ToolEvent[],
    outcome: "success" | "failure" | "unknown"
  ): TrajectoryMatchResult {
    const normalizedEvents = events.map(e => CommandNormalizer.normalizeToolEvent(e));
    const matchedExpectationIds: string[] = [];
    const violatedExpectationIds: string[] = [];
    
    // De-duplicate evidence refs (ToolEvent.event_id)
    const evidenceRefsSet = new Set<string>();

    const recommendIds = new Set<string>([
      ...expectations.orderedExpectations.map(e => e.id),
      ...expectations.unorderedExpectations.filter(e => e.type === "recommend").map(e => e.id)
    ]);
    const avoidIds = new Set<string>(
      expectations.unorderedExpectations.filter(e => e.type === "avoid").map(e => e.id)
    );

    // Helper to scan for matched event from a start index
    const findEventIndex = (
      exp: TrajectoryExpectation,
      fromIndex: number
    ): number => {
      for (let i = fromIndex; i < normalizedEvents.length; i++) {
        const ev = normalizedEvents[i];
        if (!ev) continue;
        // Positive expectations should not be fail events
        if (ev.status === "failure") continue;

        if (this.matches(exp, ev)) {
          return i;
        }
      }
      return -1;
    };

    // 1. Greedy Sequence Alignment for orderedExpectations (Recommended commands)
    let currentPointer = 0;
    for (const exp of expectations.orderedExpectations) {
      const idx = findEventIndex(exp, currentPointer);
      if (idx !== -1) {
        matchedExpectationIds.push(exp.id);
        const originalEvent = events[idx];
        if (originalEvent?.event_id) {
          evidenceRefsSet.add(originalEvent.event_id);
        }
        currentPointer = idx + 1; // Move cursor beyond this matched event
      } else {
        violatedExpectationIds.push(exp.id);
      }
    }

    // 2. Global Unordered Expectations Analysis
    for (const exp of expectations.unorderedExpectations) {
      if (exp.type === "recommend") {
        // Global search anywhere in the timeline
        let foundIdx = -1;
        for (let i = 0; i < normalizedEvents.length; i++) {
          const ev = normalizedEvents[i];
          if (ev && ev.status !== "failure" && this.matches(exp, ev)) {
            foundIdx = i;
            break;
          }
        }

        if (foundIdx !== -1) {
          matchedExpectationIds.push(exp.id);
          const originalEvent = events[foundIdx];
          if (originalEvent?.event_id) {
            evidenceRefsSet.add(originalEvent.event_id);
          }
        } else {
          violatedExpectationIds.push(exp.id);
        }
      } else if (exp.type === "avoid") {
        // Violations can happen anywhere in the timeline, regardless of success/failure
        const violatingIndices: number[] = [];
        for (let i = 0; i < normalizedEvents.length; i++) {
          const ev = normalizedEvents[i];
          if (ev && this.matches(exp, ev)) {
            violatingIndices.push(i);
          }
        }

        if (violatingIndices.length > 0) {
          // If triggered, it is a VIOLATION
          violatedExpectationIds.push(exp.id);
          for (const idx of violatingIndices) {
            const originalEvent = events[idx];
            if (originalEvent?.event_id) {
              evidenceRefsSet.add(originalEvent.event_id);
            }
          }
        }
      }
    }

    // 3. Causal Trajectory Verdict Decision Flow
    const violatedRecommendCount = violatedExpectationIds.filter(id => recommendIds.has(id)).length;
    const violatedAvoidCount = violatedExpectationIds.filter(id => avoidIds.has(id)).length;
    const matchedRecommendCount = matchedExpectationIds.filter(id => recommendIds.has(id)).length;
    const totalRecommendCount = recommendIds.size;

    let verdict: TrajectoryMatchResult["verdict"] = "non_adoption";
    let confidence: AttributionConfidence = "low";

    const hasViolatedAvoid = violatedAvoidCount > 0;
    const allRecommendsMet = totalRecommendCount > 0 && violatedRecommendCount === 0;
    const noRecommendsDefined = totalRecommendCount === 0;

    // OpenSpec P1: Avoid step violation defaults to non_adoption/contra_adoption, 
    // and CANNOT be assumed causal_harm unless a direct failed event or failure signature is correlated.
    const isCausalHarmConfirmed = (): boolean => {
      if (outcome !== "failure") return false;
      
      for (const expId of violatedExpectationIds) {
        if (!avoidIds.has(expId)) continue;
        const exp = expectations.unorderedExpectations.find(e => e.id === expId);
        if (!exp) continue;

        // 1. If any avoid-expectation itself failed
        for (const ev of normalizedEvents) {
          if (ev.status === "failure" && this.matches(exp, ev)) {
            return true;
          }
        }

        // 2. If a failed command in the timeline contains the avoided action's keywords
        if (exp.actionType === "command" && exp.commandPattern) {
          const cleanPattern = exp.commandPattern.toLowerCase().replace(/[^a-z0-9]/g, "");
          for (const ev of normalizedEvents) {
            if (ev.status === "failure" && ev.normalizedInput) {
              const cleanInput = ev.normalizedInput.toLowerCase().replace(/[^a-z0-9]/g, "");
              if (cleanInput.includes(cleanPattern)) {
                return true;
              }
            }
          }
        }
      }
      return false;
    };

    if (hasViolatedAvoid) {
      if (isCausalHarmConfirmed()) {
        verdict = "causal_harm";
        confidence = "high";
      } else {
        verdict = "contra_adoption";
        confidence = "medium";
      }
    } else {
      if (allRecommendsMet || (noRecommendsDefined && avoidIds.size > 0)) {
        if (outcome === "success") {
          verdict = "causal_success";
          confidence = "high";
        } else {
          verdict = "adoption";
          confidence = "medium";
        }
      } else {
        verdict = "non_adoption";
        if (matchedRecommendCount > 0) {
          confidence = "medium";
        } else {
          confidence = "low";
        }
      }
    }

    return {
      verdict,
      confidence,
      matchedExpectationIds,
      violatedExpectationIds,
      evidenceRefs: Array.from(evidenceRefsSet)
    };
  }

  /**
   * Core element comparator for expectations and normalized events.
   */
  public static matches(
    exp: TrajectoryExpectation,
    event: NormalizedToolEvent
  ): boolean {
    // 1. ToolNamePattern match (if present)
    if (exp.toolNamePattern) {
      const regex = new RegExp(`^(?:${exp.toolNamePattern})$`, "i");
      if (!regex.test(event.toolName)) {
        return false;
      }
    }

    // 2. Command action alignment
    if (exp.actionType === "command" && exp.commandPattern) {
      const isCmdTool = event.toolName === "run_command" || 
        ["bash", "execute_command", "terminal", "sh"].includes(event.toolName.toLowerCase());

      if (isCmdTool) {
        const expCmd = CommandNormalizer.normalizeCommand(exp.commandPattern);
        if (expCmd.commandFamily && event.commandFamily) {
          if (expCmd.commandFamily.toLowerCase() === event.commandFamily.toLowerCase()) {
            if (expCmd.subcommand) {
              if (expCmd.subcommand.toLowerCase() === (event.subcommand || "").toLowerCase()) {
                return true;
              }
            } else {
              // No subcommand required in expectation
              return true;
            }
          }
        }

        // Substring fallback for robust matching (scrubbing spaces & underscores)
        const cleanExp = exp.commandPattern.toLowerCase().replace(/[^a-z0-9]/g, "");
        const cleanInput = (event.normalizedInput || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (cleanInput.includes(cleanExp) || cleanExp.includes(cleanInput)) {
          return true;
        }
      }
      return false;
    }

    // 3. Artifact action alignment
    if (exp.actionType === "artifact" && exp.artifactPattern) {
      const expPatternClean = exp.artifactPattern.toLowerCase().trim();

      // If expectation is purely an extension filter (e.g. ts, js, py)
      const isExtensionOnly = !expPatternClean.includes("/") && 
        !expPatternClean.includes("\\") && 
        !expPatternClean.startsWith(".");

      if (isExtensionOnly && event.artifactExtension) {
        if (event.artifactExtension.toLowerCase() === expPatternClean) {
          return true;
        }
      }

      if (event.artifactName) {
        const expBasename = CommandNormalizer.getBasename(expPatternClean);
        if (event.artifactName.toLowerCase() === expBasename) {
          return true;
        }
      }

      // Input fallback
      if (event.normalizedInput) {
        if (event.normalizedInput.toLowerCase().includes(expPatternClean)) {
          return true;
        }
      }
      return false;
    }

    // 4. Generic prose element fuzzy matcher
    if (exp.actionType === "generic") {
      const cleanOriginal = exp.originalStep.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!cleanOriginal) return false;

      const cleanInput = (event.normalizedInput || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (cleanInput.includes(cleanOriginal) || cleanOriginal.includes(cleanInput)) {
        return true;
      }

      // Stopwords for prose keywords filtering
      const stopwords = new Set([
        "the", "and", "for", "with", "this", "that", "you", "your", "not", "dont", 
        "run", "do", "execute", "should", "must", "avoid", "make", "sure", "please"
      ]);

      const expWords = exp.originalStep.toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(w => w.length > 3 && !stopwords.has(w));

      if (expWords.length > 0 && event.normalizedInput) {
        const inputLower = event.normalizedInput.toLowerCase();
        const matchCount = expWords.filter(w => inputLower.includes(w)).length;
        // Matches if 50%+ of prose keywords or at least 2 distinct keywords overlap
        if (matchCount >= Math.min(2, expWords.length)) {
          return true;
        }
      }
    }

    return false;
  }
}
