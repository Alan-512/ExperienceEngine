import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type VerificationStatus = "passed" | "failed" | "unverified";

export type ArtifactEvidence = {
  tasksCompleted: number;
  tasksTotal: number;
  hasExperienceEngineRefs: boolean;
  hasCausalAttribution: boolean;
  experienceRefs: string[];
  sessionIds: string[];
  verdicts: Array<{ file: string; line: string; verdict: "passed" | "failed" }>;
};

export type ArtifactAnalysisResult = {
  verificationStatus: VerificationStatus;
  evidence: ArtifactEvidence;
};

/**
 * Parses individual file content for task items, verification verdicts, and ExperienceEngine references.
 */
export const parseArtifactContent = (content: string, filename: string): ArtifactAnalysisResult => {
  let tasksCompleted = 0;
  let tasksTotal = 0;
  let hasExperienceEngineRefs = false;
  const experienceRefs = new Set<string>();
  const sessionIds = new Set<string>();
  const verdicts: Array<{ file: string; line: string; verdict: "passed" | "failed" }> = [];

  const lines = content.split(/\r?\n/);

  // Check for ExperienceEngine general mentions (case insensitive)
  if (/experience[-_]?engine/i.test(content) || /antigravity/i.test(content)) {
    hasExperienceEngineRefs = true;
  }

  // Look for session IDs or UUIDs in the text
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  let match;
  while ((match = uuidRegex.exec(content)) !== null) {
    sessionIds.add(match[0].toLowerCase());
  }

  // Look for experience node patterns (e.g. node_xxx or experienceengine://xxx)
  const nodeRegex = /(?:node_[a-zA-Z0-9_]+|experienceengine:\/\/[a-zA-Z0-9_\-\/]+)/gi;
  while ((match = nodeRegex.exec(content)) !== null) {
    experienceRefs.add(match[0]);
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // 1. Task checkbox parsing
    // Supports - [x], - [ ], - [/], * [x], etc.
    const checkboxMatch = trimmed.match(/^[-*]\s+`\[([ x\/])\]`/i) || trimmed.match(/^[-*]\s+\[([ x\/])\]/i);
    if (checkboxMatch) {
      tasksTotal++;
      const marker = checkboxMatch[1].toLowerCase();
      if (marker === "x") {
        tasksCompleted++;
      }
    }

    // 2. Explicit Verification Verdicts
    // Check for explicit "verification status: passed", "verification: failed" etc.
    const explicitPassed = trimmed.match(/(?:verification|verdict|status|result)\s*[:=-]\s*[`"']?(passed|success|helped)[`"']?/i);
    const explicitFailed = trimmed.match(/(?:verification|verdict|status|result)\s*[:=-]\s*[`"']?(failed|harmed|misfired)[`"']?/i);

    if (explicitPassed) {
      verdicts.push({ file: filename, line: trimmed, verdict: "passed" });
    } else if (explicitFailed) {
      verdicts.push({ file: filename, line: trimmed, verdict: "failed" });
    }

    // Check for marked checkbox lines with verification terms, e.g. - [x] Passed automated tests
    const checkboxPassed = trimmed.match(/^[-*]\s+\[x\]\s+.*(passed|success|verified|ok|correct)/i) ||
                           trimmed.match(/^[-*]\s+`\[x\]`\s+.*(passed|success|verified|ok|correct)/i);
    const checkboxFailed = trimmed.match(/^[-*]\s+\[x\]\s+.*(failed|broken|misfired|error)/i) ||
                           trimmed.match(/^[-*]\s+`\[x\]`\s+.*(failed|broken|misfired|error)/i);

    if (checkboxPassed) {
      verdicts.push({ file: filename, line: trimmed, verdict: "passed" });
    } else if (checkboxFailed) {
      verdicts.push({ file: filename, line: trimmed, verdict: "failed" });
    }
  }

  // Determine Verification Status for this single file
  let verificationStatus: VerificationStatus = "unverified";
  if (verdicts.some(v => v.verdict === "failed")) {
    verificationStatus = "failed";
  } else if (verdicts.some(v => v.verdict === "passed")) {
    verificationStatus = "passed";
  } else if (tasksTotal > 0 && tasksCompleted === tasksTotal) {
    // If all tasks are checked off and no failures found, default to passed
    verificationStatus = "passed";
  }

  return {
    verificationStatus,
    evidence: {
      tasksCompleted,
      tasksTotal,
      hasExperienceEngineRefs,
      hasCausalAttribution: verdicts.length > 0,
      experienceRefs: Array.from(experienceRefs),
      sessionIds: Array.from(sessionIds),
      verdicts
    }
  };
};

/**
 * Searches the workspace for target planning artifacts and returns aggregate analysis results.
 * Respects explicit runtime finalization facts by combining telemetry if available.
 */
export const analyzeWorkspaceArtifacts = (
  workspaceDir: string,
  targetFiles = ["task.md", "walkthrough.md", "implementation_plan.md"]
): ArtifactAnalysisResult => {
  let aggregateStatus: VerificationStatus = "unverified";
  let totalTasksCompleted = 0;
  let totalTasksTotal = 0;
  let hasExperienceEngineRefs = false;
  const experienceRefs = new Set<string>();
  const sessionIds = new Set<string>();
  const allVerdicts: Array<{ file: string; line: string; verdict: "passed" | "failed" }> = [];

  for (const filename of targetFiles) {
    const filePath = join(workspaceDir, filename);
    if (!existsSync(filePath)) {
      continue;
    }

    try {
      const content = readFileSync(filePath, "utf8");
      const result = parseArtifactContent(content, filename);

      totalTasksCompleted += result.evidence.tasksCompleted;
      totalTasksTotal += result.evidence.tasksTotal;
      if (result.evidence.hasExperienceEngineRefs) {
        hasExperienceEngineRefs = true;
      }
      for (const ref of result.evidence.experienceRefs) {
        experienceRefs.add(ref);
      }
      for (const sid of result.evidence.sessionIds) {
        sessionIds.add(sid);
      }
      for (const v of result.evidence.verdicts) {
        allVerdicts.push(v);
      }

      // Propagate statuses: failed takes precedence over passed, passed over unverified
      if (result.verificationStatus === "failed") {
        aggregateStatus = "failed";
      } else if (result.verificationStatus === "passed" && aggregateStatus !== "failed") {
        aggregateStatus = "passed";
      }
    } catch {
      // Ignore reading errors gracefully
    }
  }

  // If no explicit verdicts but we checked off all tasks, and total > 0, aggregate is passed
  if (aggregateStatus === "unverified" && totalTasksTotal > 0 && totalTasksCompleted === totalTasksTotal) {
    aggregateStatus = "passed";
  }

  return {
    verificationStatus: aggregateStatus,
    evidence: {
      tasksCompleted: totalTasksCompleted,
      tasksTotal: totalTasksTotal,
      hasExperienceEngineRefs,
      hasCausalAttribution: allVerdicts.length > 0,
      experienceRefs: Array.from(experienceRefs),
      sessionIds: Array.from(sessionIds),
      verdicts: allVerdicts
    }
  };
};
