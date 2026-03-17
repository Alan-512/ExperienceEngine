export type TaskType =
  | "bug_fix"
  | "build_debug"
  | "test_debug"
  | "integration_fix"
  | "feature_add"
  | "refactor"
  | "performance"
  | "general";
export type ResolvedTaskType = TaskType | "unknown";

export type ExperienceState = "candidate" | "active" | "cooling" | "retired";
export type ExperienceNodeType = "strategy" | "warning";
export type InjectionMode = "skip" | "inject_conservative" | "inject";
export type OutcomeSignal = "success" | "failure" | "unknown";
export type ToolEventStatus = "success" | "failure" | "unknown";
export type CandidateLifecycleState = "pending" | "distilled" | "failed" | "discarded";
export type DistillationJobState = "pending" | "processing" | "succeeded" | "failed" | "discarded";

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
};

export type ExperienceInputRecord = {
  record_id: string;
  scope_id: string;
  session_id?: string;
  task_type: ResolvedTaskType;
  task_summary: string;
  outcome_signal: OutcomeSignal;
  context_summary?: string;
  evidence: string[];
  injected_node_ids: string[];
  created_at: string;
};

export type TaskRun = {
  id: string;
  host: "openclaw" | "claude-code" | "codex";
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
  created_at: string;
  updated_at: string;
};

export type OutcomeRecord = {
  id: string;
  task_run_id: string;
  outcome_signal: OutcomeSignal;
  failure_signature?: string;
  summary: string;
  created_at: string;
};

export type ReviewEvent = {
  id: string;
  node_id: string;
  task_run_id?: string;
  event_type: "mark_helped" | "mark_harmed" | "cool" | "retire";
  source: "automatic" | "user";
  created_at: string;
};

export type ExperienceNode = {
  id: string;
  node_type: ExperienceNodeType;
  scope_id: string;
  task_type: TaskType;
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
  source_kind: "system_derived" | "user_authored_candidate_promoted";
  origin_record_ids: string[];
  helped_record_ids: string[];
  harmed_record_ids: string[];
  state: ExperienceState;
  usage_count: number;
  helped_count: number;
  harmed_count: number;
  support_count: number;
  last_used_at?: string;
  last_helped_at?: string;
  last_harmed_at?: string;
  created_at: string;
  updated_at: string;
};

export type InjectionEvent = {
  injection_id: string;
  scope_id: string;
  task_type: TaskType;
  mode: Exclude<InjectionMode, "skip">;
  injected_node_ids: string[];
  injection_count: number;
  was_successful: boolean | null;
  harm_observed: boolean | null;
  created_at: string;
  resolved_at?: string;
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
  tool_event_summary: string[];
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
  retry_count: number;
  last_error?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
  discarded_at?: string;
};
