export type HybridRoute =
  | "FAST_PATH"
  | "FAST_PATH_CONSERVATIVE"
  | "ESCALATE_SYNC_EXPLAIN"
  | "ESCALATE_ASYNC_POSTMORTEM";

export type HybridRolloutMode = "live" | "shadow" | "canary";

export type HybridTaskStage = "prompt" | "posttask";

export type HybridRouteSignals = {
  taskStage: HybridTaskStage;
  explicitExplanationRequest: boolean;
  existingConservativePathRequired: boolean;
  completedRun: boolean;
  terminalOutcomeRecorded: boolean;
  boundedPosttaskCapsuleAvailable: boolean;
  postmortemAlreadyRecorded: boolean;
  lightweightOrExcludedTask: boolean;
  directionalCorrectionPresent: boolean;
  injectedNodeInteractionPresent: boolean;
  retryOrInvalidationSignaturePresent: boolean;
  meaningfulFailureSignaturePresent: boolean;
  conservativeTransitionReviewWorthy: boolean;
  rolloutAllowsAsyncPostmortem: boolean;
};

export type HybridRouteDecision = {
  route: HybridRoute;
  reasonCode:
    | "default_fast_path"
    | "existing_conservative_path_required"
    | "explicit_explanation_request"
    | "eligible_async_postmortem_review";
  policyVersion: string;
};

export type HybridRoutePolicy = {
  enabled: boolean;
  syncExplainEnabled: boolean;
  asyncPostmortemEnabled: boolean;
  policyVersion: string;
};

export type HybridCapsuleEvidenceSource =
  | "task_summary"
  | "context_summary"
  | "decision_explanation"
  | "retrieval_note"
  | "timeline"
  | "tool_event";

export type HybridCapsuleEvidence = {
  source: HybridCapsuleEvidenceSource;
  text: string;
  trust: "untrusted_evidence";
  truncated: boolean;
};

export type ExplainDecisionCapsule = {
  task: "explain_decision";
  schemaVersion: string;
  trusted: {
    route: HybridRouteDecision;
    inspection: {
      scopeId: string;
      taskType: string;
      intervention: "inject" | "skip" | "shadow" | "holdout";
      deliveryMode?: string;
      autoFeedback: "helped" | "harmed" | "none";
      outcome: "success" | "failure" | "unknown";
      learningStatus?: "captured" | "rejected" | "not_applicable";
    };
    scorecard?: {
      mode?: "inject" | "inject_conservative" | "skip";
      decisionReason?: string;
      riskLevel?: "low" | "medium" | "high";
      fastPathApplied?: boolean;
      queryRewriteApplied?: boolean;
    };
  };
  evidence: HybridCapsuleEvidence[];
};

export type PostmortemReviewCapsule = {
  task: "postmortem_review";
  schemaVersion: string;
  trusted: {
    route: HybridRouteDecision;
    run: {
      taskRunId: string;
      scopeId: string;
      taskType: string;
      finalStatus: "success" | "failure" | "cancelled" | "unknown";
      learningStatus?: "captured" | "rejected" | "not_applicable";
      outcomeSignal: "success" | "failure" | "unknown";
    };
    reviewTriggers: {
      directionalCorrectionPresent: boolean;
      injectedNodeInteractionPresent: boolean;
      retryOrInvalidationSignaturePresent: boolean;
      meaningfulFailureSignaturePresent: boolean;
      conservativeTransitionReviewWorthy: boolean;
    };
  };
  evidence: HybridCapsuleEvidence[];
};

export type HybridApprovalClass =
  | "advisory"
  | "review_artifact"
  | "policy_gated"
  | "blocked";

export type ExplainDecisionWorkerOutput = {
  task: "explain_decision";
  decision: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  evidence_summary?: string;
};

export type PostmortemReviewWorkerOutput = {
  task: "postmortem_review";
  review_verdict: "review_artifact" | "policy_gated";
  candidate_recommendation: "capture" | "reject" | "observe";
  feedback_followup_recommendation: "none" | "mark_helped" | "mark_harmed" | "review";
  confidence: "high" | "medium" | "low";
  reason: string;
  review_artifact?: {
    summary: string;
    notes: string[];
  };
  suggestedFollowUps?: string[];
  candidateShapingSuggestions?: string[];
  governanceRecommendations?: string[];
  lifecycleSuggestions?: string[];
  writeBackSuggestions?: string[];
};

export type HybridValidationSuccess<T> = {
  status: "accepted";
  approvalClass: HybridApprovalClass;
  value: T;
};

export type HybridValidationFailure = {
  status: "rejected";
  reason:
    | "schema_invalid"
    | "missing_required_fields"
    | "trust_boundary_violation"
    | "policy_violation"
    | "approval_blocked";
  detail: string;
};
