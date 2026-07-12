export type TaskType =
  | "bug_fix"
  | "build_debug"
  | "config_debug"
  | "test_debug"
  | "integration_fix"
  | "feature_add"
  | "refactor"
  | "performance"
  | "general";
export type ResolvedTaskType = TaskType | "unknown";

export type ExperienceState = "candidate" | "priority_candidate" | "active" | "cooling" | "retired";
export type DeliveryState = "shadow_only" | "conservative_only" | "eligible" | "quarantined" | "shadow_probe" | "retired";
export type ExperienceNodeType = "strategy" | "warning";
export type PromotionSignal = "normal" | "high_value";
export type MergeAction = "ADD" | "UPDATE" | "NONE";
export type ExperienceKind =
  | "execution_pattern"
  | "config_troubleshooting"
  | "verification_loop"
  | "warning"
  | "expectation_correction";
export type ConfidenceSignal = "confirmed_by_user" | "supported_by_objective_success" | "unconfirmed";
export type ValidationState = "pending_reuse_validation" | "validated_by_reuse" | "invalidated";
export type CorrectionScope = "task_local" | "repo_local" | "workflow_local" | "host_local" | "cross_repo_candidate";
export type CorrectionCategory =
  | "goal_interpretation"
  | "quality_bar"
  | "interaction_behavior"
  | "verification_order"
  | "implementation_boundary"
  | "style_constraint";
export type InjectionMode = "skip" | "inject_conservative" | "inject";
export type InterventionStrength =
  | "diagnostic_hint"
  | "soft_recommendation"
  | "strong_recommendation"
  | "hard_constraint";
export type InjectionRiskLevel = "low" | "medium" | "high";
export type MatchBand = "high" | "medium" | "low";
export type ScopeMatchBand = "same" | "related" | "cross" | "none";
export type MatchScorecard = {
  scopeMatch: ScopeMatchBand;
  taskTypeMatch: MatchBand;
  techStackMatch: MatchBand;
  failureSignatureMatch: MatchBand;
  artifactMatch: MatchBand;
  intentMatch: MatchBand;
  negativeEvidence: string[];
  overallMatchBand: MatchBand;
  directInjectEligible: boolean;
};
export type InterventionConfidence = "low" | "medium" | "high";
export type InterventionBudgetClass = "none" | "single_hint" | "multi_hint";
export type SkipReasonCode =
  | "scope_disabled"
  | "repo_policy_blocked_or_circuit_open"
  | "holdout_suppressed"
  | "shadow_suppressed"
  | "no_candidate"
  | "candidate_not_mature"
  | "delivery_state_shadow_only"
  | "recent_harm_or_quarantined"
  | "semantic_match_policy_rejected"
  | "task_family_mismatch"
  | "low_confidence_or_score_margin"
  | "record_only_diagnostic_candidate";
export type SyncSecondOpinionDecision = "allow" | "allow_conservative" | "skip";
export type SyncSecondOpinionTrigger =
  | "conservative_delivery_state"
  | "harm_history"
  | "close_score_margin"
  | "expectation_correction";
export type EvaluationMode = "live" | "shadow" | "holdout";
export type OutcomeSignal = "success" | "failure" | "unknown";
export type AttributionVerdict =
  | "strong_helped"
  | "weak_helped"
  | "neutral"
  | "unknown"
  | "weak_harmed"
  | "strong_harmed";
export type AttributionConfidence = "low" | "medium" | "high";
export type AttributionSource = "automatic" | "manual_override" | "diagnostic_record";
export type RepoExperienceMode = "safe" | "fast_learning" | "strict";
export type RepoCircuitState = "clear" | "tripped";
export type ToolEventStatus = "success" | "failure" | "unknown";
export type CandidateLifecycleState = "pending" | "blocked" | "distilled" | "failed" | "discarded";
export type DistillationJobState = "pending" | "processing" | "blocked" | "succeeded" | "failed" | "discarded";
export type DistillationMode = "auto" | "llm" | "rule" | "disabled";
export type ResolvedDistillationMode = Exclude<DistillationMode, "auto">;
export type DistillationSource = "explicit_provider" | "rule" | "disabled";
export type FeedbackVerdict = "helped" | "harmed" | "uncertain";
export type FeedbackAttributionReason =
  | "success_outcome"
  | "relevant_failure"
  | "environmental_failure"
  | "exploratory_failure"
  | "no_relevant_failure"
  | "suppressed_delivery"
  | "unknown_outcome";

export type Scope = {
  scope_id: string;
  scope_type: "workspace" | "repo";
  scope_name: string;
  root_path?: string;
  is_disabled: boolean;
  created_at: string;
  updated_at: string;
};

export type ToolEvent = {
  event_id: string;
  tool_name: string;
  input_summary?: string;
  output_summary?: string;
  status: ToolEventStatus;
  exit_code?: number;
  error_signature?: string;
  started_at: string;
  ended_at?: string;
};

export type ExperienceInput = {
  scope_id: string;
  task_type: ResolvedTaskType;
  task_summary: string;
  tool_events: ToolEvent[];
  outcome_signal: OutcomeSignal;
  context_summary?: string;
  injected_node_ids: string[];
  trace_capsule_id?: string;
  trace_completeness?: number;
  trace_provenance?: TraceProvenanceSummary;
  trace_is_unstable?: boolean;
};

export type RetrievalContext = {
  scopeId: string;
  host: TaskRun["host"];
  taskType: ResolvedTaskType;
  taskSummary: string;
  contextSummary?: string;
  toolNames: string[];
  failureSignature?: string;
  outcomeSignal: OutcomeSignal;
  injectedNodeIds: string[];
  isReadOnly?: boolean;
  modulePaths?: string[];
  expectationCorrectionIntent?: boolean;
  db?: any;
};

export type RetrievalPolicyStageName =
  | "retrieval_context"
  | "hard_filter"
  | "shortlist"
  | "semantic_rerank_backfill"
  | "policy_enrichment"
  | "decision_assembly";

export type RetrievalPolicyStageDiagnostic = {
  stage: RetrievalPolicyStageName;
  acceptedCount?: number;
  rejectedCount?: number;
  passedCount?: number;
  reasonCodes: string[];
};

export type RetrievalPolicyDiagnostics = {
  stages: RetrievalPolicyStageDiagnostic[];
};

export type PolicyEnrichmentComponentCategory =
  | "family_fit"
  | "specificity"
  | "feedback"
  | "maturity"
  | "penalty"
  | "expectation_correction"
  | "task_alignment"
  | "retrieval_context";

export type PolicyEnrichmentComponent = {
  name: string;
  category: PolicyEnrichmentComponentCategory;
  value: number;
  reason: string;
};

export type ExperienceInputRecord = {
  record_id: string;
  episode_id?: string;
  scope_id: string;
  session_id?: string;
  task_type: ResolvedTaskType;
  task_summary: string;
  outcome_signal: OutcomeSignal;
  context_summary?: string;
  evidence: string[];
  injected_node_ids: string[];
  trace_capsule_id?: string;
  trace_completeness?: number;
  trace_provenance?: TraceProvenanceSummary;
  created_at: string;
};

export type TaskRun = {
  id: string;
  episode_id?: string;
  host: "openclaw" | "claude-code" | "codex" | "antigravity";
  scope_id: string;
  session_id?: string;
  task_type: ResolvedTaskType;
  task_summary: string;
  prompt_excerpt?: string;
  context_summary?: string;
  started_at: string;
  ended_at?: string;
  final_status: "success" | "failure" | "cancelled" | "unknown";
  failure_signature?: string;
  learning_status?: "captured" | "rejected" | "not_applicable";
  learning_reason?: string;
  trace_capsule_id?: string;
  trace_completeness?: number;
  trace_provenance?: TraceProvenanceSummary;
  created_at: string;
  updated_at: string;
};

export type OutcomeRecord = {
  id: string;
  episode_id?: string;
  task_run_id: string;
  outcome_signal: OutcomeSignal;
  failure_signature?: string;
  summary: string;
  created_at: string;
};

export type ReviewEvent = {
  id: string;
  episode_id?: string;
  node_id: string;
  task_run_id?: string;
  event_type:
    | "mark_helped"
    | "mark_harmed"
    | "mark_uncertain"
    | "cool"
    | "retire"
    | "quarantine"
    | "restore_conservative"
    | "restore_eligible"
    | "promote_eligible";
  source: "automatic" | "user";
  created_at: string;
};

export type HybridReviewArtifact = {
  id: string;
  task_run_id: string;
  scope_id: string;
  worker_task: "postmortem_review";
  approval_class: "review_artifact" | "policy_gated";
  schema_version: string;
  route_policy_version: string;
  worker_profile_version: string;
  recommendation: "capture" | "reject" | "observe";
  summary: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type HybridInvocationTrace = {
  id: string;
  surface: "interaction" | "runtime";
  session_id?: string;
  scope_id?: string;
  worker_task?: "explain_decision" | "postmortem_review";
  route: string;
  route_policy_version: string;
  capsule_schema_version?: string;
  worker_profile_version?: string;
  rollout_mode: string;
  rollout_reason: string;
  worker_ran: boolean;
  validation_status: "accepted" | "fallback" | "skipped";
  output_action: "surfaced" | "stored" | "rejected" | "none";
  fallback_reason?: string;
  created_at: string;
};

export type ExperienceNode = {
  id: string;
  node_type: ExperienceNodeType;
  scope_id: string;
  task_type: TaskType;
  experience_kind?: ExperienceKind;
  confidence_signal?: ConfidenceSignal;
  validation_state?: ValidationState;
  correction_scope?: CorrectionScope;
  correction_category?: CorrectionCategory;
  deviation_pattern?: string;
  corrected_constraint?: string;
  trigger_pattern: string;
  applicability_notes?: string;
  env_signature?: string;
  compact_hint: string;
  goal?: string;
  recommended_steps?: string[];
  avoid_steps?: string[];
  fallback_steps?: string[];
  success_signal: string;
  stop_condition?: string;
  escalation_condition?: string;
  evidence_summary: string;
  retrieval_text?: string;
  embedding?: number[];
  embedding_provider?: string;
  embedding_model?: string;
  embedding_version?: string;
  embedding_dimensions?: number;
  distillation_mode_used?: ResolvedDistillationMode;
  distillation_source?: DistillationSource;
  redistilled_from?: DistillationSource;
  promotion_signal?: PromotionSignal;
  promotion_reason?: string;
  merge_decision?: MergeAction;
  merge_reason?: string;
  priority_promotion_applied?: boolean;
  source_kind: "system_derived" | "user_authored_candidate_promoted";
  origin_record_ids: string[];
  helped_record_ids: string[];
  harmed_record_ids: string[];
  state: ExperienceState;
  delivery_state?: DeliveryState;
  usage_count: number;
  helped_count: number;
  harmed_count: number;
  consecutive_harmed_count?: number;
  last_feedback_verdict?: FeedbackVerdict;
  support_count: number;
  last_used_at?: string;
  last_helped_at?: string;
  last_harmed_at?: string;
  quarantined_at?: string;
  quarantine_reason?: string;
  embedding_manifest_id?: string;
  migration_status?: 'current' | 'pending' | 'migrating' | 'failed';
  migration_last_error?: string;
  migration_updated_at?: string;
  source_fingerprint_hash?: string;
  portable_validation_evidence?: {
    compatibilityClasses: Record<string, {
      successReuseCount: number;
      harmCount: number;
      lastUsedAt: number;
    }>;
  };
  quarantine_lease_expires_at?: string;
  quarantine_original_delivery_state?: DeliveryState;
  quarantine_release_attempt_count?: number;
  quarantine_last_release_attempt_at?: string;
  quarantine_release_reason?: string;
  quarantine_no_harm_pass_count?: number;
  contains_unbenchmarked_origin?: boolean;
  contains_revoked_profile_origin?: boolean;
  semantic_origin_count?: number;
  exact_provenance_key_count?: number;
  compacted_provenance_origin_count?: number;
  effective_generation_assurance_floor?: "unbenchmarked" | "supported" | "recommended";
  created_at: string;
  updated_at: string;
};

export type InjectionEvent = {
  injection_id: string;
  episode_id?: string;
  session_id?: string;
  scope_id: string;
  task_type: TaskType;
  task_summary?: string;
  mode: InjectionMode;
  delivery_mode: EvaluationMode;
  delivered: boolean;
  injected_node_ids: string[];
  injection_count: number;
  scorecard?: InjectionScorecard;
  was_successful: boolean | null;
  harm_observed: boolean | null;
  attribution_reason?: FeedbackAttributionReason;
  created_at: string;
  resolved_at?: string;
};

export type AttributionRecord = {
  id: string;
  injection_id?: string;
  node_id: string;
  episode_id?: string;
  intervention_strength?: InterventionStrength;
  injection_mode?: InjectionMode;
  delivery_mode?: EvaluationMode;
  delivered: boolean;
  outcome: OutcomeSignal;
  attribution_verdict: AttributionVerdict;
  confidence: AttributionConfidence;
  evidence_refs: string[];
  user_override?: "helped" | "harmed" | "neutral";
  source: AttributionSource;
  attribution_reason?: FeedbackAttributionReason | "manual_override" | "diagnostic_record";
  trajectory_verdict?: string;
  trajectory_confidence?: string;
  trajectory_matched_expectations?: string[];
  trajectory_violated_expectations?: string[];
  trajectory_evidence_refs?: string[];
  created_at: string;
  resolved_at?: string;
};

export type RepoPolicy = {
  scope_id: string;
  configured_mode: RepoExperienceMode;
  effective_mode: RepoExperienceMode;
  circuit_state: RepoCircuitState;
  circuit_reason?: string;
  live_diagnostics_disabled: boolean;
  created_at: string;
  updated_at: string;
  last_tripped_at?: string;
  restored_at?: string;
};

export type EpisodeProjection = {
  episode_id: string;
  scope_id?: string;
  session_id?: string;
  task_run?: TaskRun;
  input_records: ExperienceInputRecord[];
  outcome_records: OutcomeRecord[];
  injection_events: InjectionEvent[];
  attribution_records: AttributionRecord[];
  review_events: ReviewEvent[];
};

export type EpisodeSummary = {
  episode_id: string;
  scope_id: string;
  session_id?: string;
  task_type?: ResolvedTaskType;
  task_summary?: string;
  outcome?: OutcomeSignal;
  created_at: string;
  updated_at: string;
};

export type InjectionScorecardNode = {
  id: string;
  nodeType: ExperienceNodeType;
  state: ExperienceState;
  sourceKind: ExperienceNode["source_kind"];
  distillationSource?: DistillationSource;
  triggerPattern: string;
  hint: string;
  helped: number;
  harmed: number;
  supportCount: number;
  riskLevel: InjectionRiskLevel;
  whyMatched: string[];
};

export type InjectionScorecardCandidate = {
  id: string;
  matchScorecard?: MatchScorecard;
  portabilityScorecard?: PortabilityScorecard;
  semanticScore?: number;
  lexicalScore?: number;
  fusedScore?: number;
  retrievalScore?: number;
  policyAdjustment?: number;
  policyScore?: number;
  totalScore?: number;
  rerankScore?: number;
  rerankSource?: "heuristic" | "model";
  retrievalReasons?: string[];
  policyReasons?: string[];
  policyComponents?: PolicyEnrichmentComponent[];
  taskFamilyMatch: boolean;
};

export type InterventionRejectedCandidate = {
  id: string;
  reasonCodes: string[];
  retrievalScore?: number;
  policyAdjustment?: number;
  totalScore?: number;
};

export type InterventionDecisionDiagnostics = {
  interventionStrength?: InterventionStrength;
  renderingPolicyReason?: string;
  skipReasonCode?: SkipReasonCode;
  skipReasonExplanation?: string;
  recordOnlyDiagnosticCandidateIds?: string[];
  retrievalPolicyDiagnostics?: RetrievalPolicyDiagnostics;
  topCandidates: InjectionScorecardCandidate[];
  topCandidateScore?: number;
  scoreMargin?: number;
  fastPathApplied: boolean;
  queryRewriteApplied?: boolean;
  mergeDecision?: ExperienceNode["merge_decision"];
  mergeReason?: ExperienceNode["merge_reason"];
  promotionSignal?: ExperienceNode["promotion_signal"];
  priorityPromotionApplied?: boolean;
  gateReason: string;
  decisionReason: string;
  confidence: InterventionConfidence;
  budgetClass: InterventionBudgetClass;
  secondOpinionApplied?: boolean;
  secondOpinionDecision?: SyncSecondOpinionDecision;
  secondOpinionReason?: string;
  secondOpinionTrigger?: SyncSecondOpinionTrigger;
  selectedCandidateIds: string[];
  rejectedCandidates: InterventionRejectedCandidate[];
};

export type InjectionScorecard = {
  sessionId?: string;
  scopeId: string;
  taskType: TaskType;
  taskSummary: string;
  mode: InjectionMode;
  interventionStrength?: InterventionStrength;
  renderingPolicyReason?: string;
  skipReasonCode?: SkipReasonCode;
  skipReasonExplanation?: string;
  riskLevel: InjectionRiskLevel;
  recommendation: string;
  reasons: string[];
  topCandidates?: InjectionScorecardCandidate[];
  topCandidateScore?: number;
  scoreMargin?: number;
  fastPathApplied?: boolean;
  queryRewriteApplied?: boolean;
  mergeDecision?: MergeAction;
  mergeReason?: string;
  promotionSignal?: PromotionSignal;
  priorityPromotionApplied?: boolean;
  gateReason?: string;
  decisionReason?: string;
  confidence?: InterventionConfidence;
  budgetClass?: InterventionBudgetClass;
  secondOpinionApplied?: boolean;
  secondOpinionDecision?: SyncSecondOpinionDecision;
  secondOpinionReason?: string;
  secondOpinionTrigger?: SyncSecondOpinionTrigger;
  selectedCandidateIds?: string[];
  recordOnlyDiagnosticCandidateIds?: string[];
  retrievalPolicyDiagnostics?: RetrievalPolicyDiagnostics;
  rejectedCandidates?: InterventionRejectedCandidate[];
  nodes: InjectionScorecardNode[];
  createdAt: string;
};

export type ScopeTaskStats = {
  scope_id: string;
  task_type: TaskType;
  total_tasks: number;
  success_tasks: number;
  failed_tasks: number;
  unknown_tasks: number;
  injected_tasks: number;
  injected_success_tasks: number;
  updated_at: string;
};

export type ExperienceCandidateDraft = Omit<
  ExperienceNode,
  | "id"
  | "state"
  | "usage_count"
  | "helped_count"
  | "harmed_count"
  | "support_count"
  | "origin_record_ids"
  | "helped_record_ids"
  | "harmed_record_ids"
  | "last_used_at"
  | "last_helped_at"
  | "last_harmed_at"
  | "created_at"
  | "updated_at"
>;

export type CandidateSourceSignal = {
  task_summary: string;
  context_summary?: string;
  outcome_signal: OutcomeSignal;
  tool_events: ToolEvent[];
  evidence: string[];
  failure_signature?: string;
  retry_count: number;
  correction_signals: string[];
  directional_correction?: {
    detected: boolean;
    sources: string[];
    snippets: string[];
    correction_strength?: "low" | "medium" | "high";
    correction_source?: "user_explicit" | "task_evidence" | "mixed";
    objective_support: boolean;
    user_confirmation: boolean;
    improvement_evidence?: "none" | "objective_support" | "user_confirmation" | "mixed";
    semantic_detected?: boolean;
    correction_category?: CorrectionCategory;
    deviation_pattern?: string;
    corrected_constraint?: string;
  };
  evidence_driven_reversal?: {
    detected: boolean;
    reversal_source?: "task_evidence";
    reversal_strength?: "low" | "medium" | "high";
    prior_hypothesis: boolean;
    invalidating_evidence: boolean;
    validating_evidence: boolean;
    hypothesis_snippets: string[];
    invalidating_snippets: string[];
    pivot_snippets: string[];
    replacement_snippets: string[];
    validating_snippets: string[];
    semantic_detected?: boolean;
    superseded_hypothesis?: string;
    replacement_constraint?: string;
    verification_evidence?: string;
    pivot_summary?: string;
    correction_category?: CorrectionCategory;
    deviation_pattern?: string;
    corrected_constraint?: string;
  };
  tool_event_summary: string[];
  trace_capsule_id?: string;
  trace_completeness?: number;
  trace_is_unstable?: boolean;
  trace_windows?: {
    correction_events_count: number;
    verification_events_count: number;
    file_change_events_count: number;
    adoption_events_count: number;
  };
};

export type ExperienceCandidate = ExperienceCandidateDraft & {
  id: string;
  task_run_id?: string;
  candidate_kind?: "failure" | "correction" | "retry_pattern" | "successful_fix";
  source_record_id: string;
  source_context_summary?: string;
  source_outcome_signal: OutcomeSignal;
  raw_summary?: string;
  failure_signature?: string;
  source_signal: CandidateSourceSignal;
  lifecycle_state: CandidateLifecycleState;
  retry_count: number;
  state_revision?: number;
  content_retry_count?: number;
  failure_code?: string;
  failure_class?: "system_route" | "candidate_content" | "interruption" | "terminal";
  failure_scope?: string;
  blocked_at?: string;
  terminal_reason_code?: string;
  semantic_origin_provenance_key?: string;
  distilled_node_id?: string;
  last_error?: string;
  created_at: string;
  updated_at: string;
  distilled_at?: string;
  discarded_at?: string;
  last_failed_at?: string;
};

export type DistillationJob = {
  id: string;
  candidate_id: string;
  status: DistillationJobState;
  extractor_profile: string;
  distillation_source?: DistillationSource;
  failure_bucket?: string;
  retry_count: number;
  home_id?: string;
  state_revision?: number;
  claim_id?: string;
  claim_owner_id?: string;
  claim_fencing_token?: number;
  claimed_supervisor_owner_id?: string;
  claimed_supervisor_lease_epoch?: number;
  claimed_package_generation_id?: string;
  claimed_activation_revision?: number;
  claimed_production_activation_handshake_id?: string;
  claimed_configuration_generation_id?: string;
  claimed_effective_route_set_id?: string;
  claimed_effective_route_revision?: number;
  claimed_capability?: string;
  claimed_route_fingerprint?: string;
  claimed_schema_version?: string;
  claimed_job_schema_version?: string;
  claimed_candidate_schema_version?: string;
  claimed_node_schema_version?: string;
  claimed_at?: string;
  claim_heartbeat_at?: string;
  claim_expires_at?: string;
  failure_code?: string;
  failure_class?: "system_route" | "candidate_content" | "interruption" | "terminal";
  failure_scope?: string;
  system_attempt_count?: number;
  interruption_count?: number;
  content_retry_count?: number;
  next_attempt_at?: string;
  blocked_at?: string;
  route_fingerprint?: string;
  terminal_reason_code?: string;
  last_error?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
  discarded_at?: string;
};

export type ProjectFingerprint = {
  schemaVersion: string;
  fingerprintHash: string;
  timestamp: number;
  primaryLanguage: string;
  packageManager: string;
  lockfileFamily: string;
  frameworks: Record<string, number>;
  databaseOrORM: Record<string, number>;
  testBuildTools: Record<string, number>;
  hostRuntimeAdapters: Record<string, number>;
  configMarkers: string[];
  workspaceRootPath?: string;
  projectRootScopeId?: string;
};

export type ScopeFingerprint = {
  scope_id: string;
  schema_version: string;
  fingerprint_hash: string;
  fingerprint_json: string; // Serialized ProjectFingerprint
  created_at: string;
  updated_at: string;
};

export type OfflineAssetManifest = {
  id?: string;
  manifestVersion: string;
  providerId: string;
  modelId: string;
  dimensions: number;
  preprocessingVersion: string;
  assets: Record<string, { path: string; sha256: string }>;
  license?: string;
  sourceMetadata?: Record<string, unknown>;
};

export type PortabilityBand =
  | "incompatible"
  | "weakly_related"
  | "same_family"
  | "validated_portable";

export type PortabilityScorecard = {
  portabilityBand: PortabilityBand;
  score: number;
  matchedLanguage: boolean;
  sharedDependencies: string[];
  penalties: Array<{
    dependency: string;
    category: string;
    penalty: number;
    reason: string;
  }>;
  negativeEvidence: string[];
  whyScore: string;
  successReuseCount?: number;
  harmCount?: number;
};

export type TrajectoryExpectationType = "recommend" | "avoid";
export type ExpectationActionType = "command" | "artifact" | "generic";

export type TrajectoryExpectation = {
  id: string;
  type: TrajectoryExpectationType;
  actionType: ExpectationActionType;
  toolNamePattern?: string;   // e.g. "run_command", "replace_file_content"
  commandPattern?: string;    // e.g. "git checkout", "pnpm test"
  artifactPattern?: string;   // e.g. "ts", "json", "src/types/domain.ts"
  artifactAction?: "read" | "write" | "any"; // e.g. "read" for view/inspect, "write" for modify/create
  originalStep: string;       // Original prose for diagnostics
  ordered: boolean;           // Whether ordering constraint applies
  sourceField?: "recommended_steps" | "avoid_steps" | "success_signal" | "stop_condition" | "escalation_condition";
  requiredForAdoption?: boolean;
};

export type CompiledTrajectoryExpectations = {
  orderedExpectations: TrajectoryExpectation[];
  unorderedExpectations: TrajectoryExpectation[];
};

export type NormalizedToolEvent = {
  toolName: string;
  commandFamily?: string;
  subcommand?: string;
  normalizedInput?: string;
  normalizedOutput?: string;
  artifactExtension?: string;
  artifactName?: string;
  artifactPath?: string;
  artifactPaths?: string[];
  status: "success" | "failure" | "unknown";
};

export type TraceTask = {
  goal: string;
  user_constraints?: string[];
  user_non_goals?: string[];
  acceptance_signals?: string[];
  injected_expectations?: string[];
  delivered_node_ids?: string[];
};

export type TraceEventSource = {
  host: "openclaw" | "claude-code" | "codex" | "antigravity";
  source_hook?: string;
  adapter_version: string;
  is_unstable?: boolean;
};

export type TraceEvent = {
  id: string;
  event_type:
    | "prompt"
    | "tool_call"
    | "tool_result"
    | "tool_failure"
    | "file_change"
    | "verification"
    | "correction"
    | "task_completion"
    | "stop"
    | "stop_failure"
    | "compaction"
    | "subagent_lifecycle"
    | "permission_request"
    | "other";
  timestamp: string;
  source: TraceEventSource;
  payload: Record<string, any>;
};

export type EvidenceRef = {
  id: string;
  ref_type: "file" | "transcript" | "artifact" | "hook_payload" | "other";
  path_or_uri: string;
  content_hash?: string;
  summary?: string;
  is_redacted?: boolean;
  size_bytes?: number;
};

export type TraceOutcome = {
  outcome_signal: OutcomeSignal | "partial";
  confidence: "low" | "medium" | "high";
  failure_signature?: string;
  summary?: string;
  verified_by?: string[];
};

export type TraceCaptureMetadata = {
  is_complete: boolean;
  completeness_score: number;
  metadata_only: boolean;
  dropped_events_count: number;
  redaction_applied: boolean;
  size_bytes: number;
};

export type TraceProvenanceSummary = {
  completeness_score: number;
  host: "openclaw" | "claude-code" | "codex" | "antigravity";
  capability_state: "verified" | "documented" | "inferred" | "disabled" | "unavailable" | "mixed";
  evidence_category_counts: Record<string, number>;
  dropped_events_count: number;
  redaction_applied: boolean;
  source_provenance: "runtime_trace";
  learning_use_reason: string;
  diagnostic_snapshot_id?: string;
};

export type HostCapabilityState = {
  state: "verified" | "documented" | "inferred" | "disabled" | "unavailable";
  provenance: "verified" | "documented" | "inferred" | "disabled";
  updated_at: string;
};

export type HostTraceCapabilityProfile = {
  host: "openclaw" | "claude-code" | "codex" | "antigravity";
  profile_version: string;
  adapter_version: string;
  capabilities: Record<string, HostCapabilityState>;
  transcript_stability: "stable" | "unstable" | "none";
  tool_coverage: string[];
  observed_at: string;
};

export type TraceCapsule = {
  id: string;
  episode_id?: string;
  task_run_id?: string;
  scope_id: string;
  session_id?: string;
  task: TraceTask;
  events: TraceEvent[];
  evidence_refs: EvidenceRef[];
  outcome: TraceOutcome;
  capture_metadata: TraceCaptureMetadata;
  host_profile: HostTraceCapabilityProfile;
  created_at: string;
  updated_at: string;
};
