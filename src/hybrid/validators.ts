import { z } from "zod";
import type {
  ExplainDecisionWorkerOutput,
  HybridApprovalClass,
  HybridValidationFailure,
  HybridValidationSuccess,
  PostmortemReviewWorkerOutput
} from "./types.js";

const explainDecisionOutputSchema = z.object({
  task: z.literal("explain_decision"),
  decision: z.string().min(1),
  reason: z.string().min(1),
  confidence: z.enum(["high", "medium", "low"]),
  evidence_summary: z.string().min(1).optional()
});

const postmortemReviewOutputSchema = z.object({
  task: z.literal("postmortem_review"),
  review_verdict: z.enum(["review_artifact", "policy_gated"]),
  candidate_recommendation: z.enum(["capture", "reject", "observe"]),
  feedback_followup_recommendation: z.enum(["none", "mark_helped", "mark_harmed", "review"]),
  confidence: z.enum(["high", "medium", "low"]),
  reason: z.string().min(1),
  review_artifact: z
    .object({
      summary: z.string().min(1),
      notes: z.array(z.string().min(1)).min(1)
    })
    .optional(),
  suggestedFollowUps: z.array(z.string()).optional(),
  candidateShapingSuggestions: z.array(z.string()).optional(),
  governanceRecommendations: z.array(z.string()).optional(),
  lifecycleSuggestions: z.array(z.string()).optional(),
  writeBackSuggestions: z.array(z.string()).optional()
});

export const parsePostmortemReviewOutput = (
  value: unknown
): PostmortemReviewWorkerOutput | HybridValidationFailure => {
  const parsed = postmortemReviewOutputSchema.safeParse(value);
  if (!parsed.success) {
    return rejected("schema_invalid", parsed.error.issues.map((issue) => issue.message).join("; "));
  }

  return parsed.data;
};

const isValidationFailure = (
  value: PostmortemReviewWorkerOutput | HybridValidationFailure
): value is HybridValidationFailure => "status" in value;

export const classifyHybridApproval = (
  value: ExplainDecisionWorkerOutput | PostmortemReviewWorkerOutput
): HybridApprovalClass => {
  if (value.task === "explain_decision") {
    return "advisory";
  }

  if ((value.lifecycleSuggestions?.length ?? 0) > 0 || (value.writeBackSuggestions?.length ?? 0) > 0) {
    return "blocked";
  }

  if (
    value.review_verdict === "policy_gated"
    || value.feedback_followup_recommendation !== "none"
    || (value.candidateShapingSuggestions?.length ?? 0) > 0
    || (value.suggestedFollowUps?.length ?? 0) > 0
    || (value.governanceRecommendations?.length ?? 0) > 0
  ) {
    return "policy_gated";
  }

  return "review_artifact";
};

const rejected = (
  reason: HybridValidationFailure["reason"],
  detail: string
): HybridValidationFailure => ({
  status: "rejected",
  reason,
  detail
});

export const validateExplainDecisionOutput = (
  value: unknown
): HybridValidationSuccess<ExplainDecisionWorkerOutput> | HybridValidationFailure => {
  const parsed = explainDecisionOutputSchema.safeParse(value);
  if (!parsed.success) {
    return rejected("schema_invalid", parsed.error.issues.map((issue) => issue.message).join("; "));
  }

  return {
    status: "accepted",
    approvalClass: "advisory",
    value: parsed.data
  };
};

export const validatePostmortemReviewOutput = (
  value: unknown
): HybridValidationSuccess<PostmortemReviewWorkerOutput> | HybridValidationFailure => {
  const parsed = parsePostmortemReviewOutput(value);
  if (isValidationFailure(parsed)) {
    return parsed;
  }

  const approvalClass = classifyHybridApproval(parsed);
  if (approvalClass === "blocked") {
    return rejected(
      "approval_blocked",
      "Phase 1 blocks lifecycle changes and write-back suggestions from worker outputs."
    );
  }

  return {
    status: "accepted",
    approvalClass,
    value: parsed
  };
};
