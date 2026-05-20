CREATE TABLE IF NOT EXISTS scopes (
  scope_id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_name TEXT NOT NULL,
  root_path TEXT,
  is_disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scope_fingerprints (
  scope_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  fingerprint_hash TEXT NOT NULL,
  fingerprint_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experience_input_records (
  record_id TEXT PRIMARY KEY,
  episode_id TEXT,
  scope_id TEXT NOT NULL,
  session_id TEXT,
  task_type TEXT NOT NULL,
  task_summary TEXT NOT NULL,
  outcome_signal TEXT NOT NULL,
  context_summary TEXT,
  evidence_json TEXT NOT NULL,
  injected_node_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_runs (
  id TEXT PRIMARY KEY,
  episode_id TEXT,
  host TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  session_id TEXT,
  task_type TEXT NOT NULL,
  task_summary TEXT NOT NULL,
  prompt_excerpt TEXT,
  context_summary TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  final_status TEXT NOT NULL,
  failure_signature TEXT,
  learning_status TEXT,
  learning_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outcome_records (
  id TEXT PRIMARY KEY,
  episode_id TEXT,
  task_run_id TEXT NOT NULL,
  outcome_signal TEXT NOT NULL,
  failure_signature TEXT,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_events (
  id TEXT PRIMARY KEY,
  episode_id TEXT,
  node_id TEXT NOT NULL,
  task_run_id TEXT,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hybrid_review_artifacts (
  id TEXT PRIMARY KEY,
  task_run_id TEXT NOT NULL UNIQUE,
  scope_id TEXT NOT NULL,
  worker_task TEXT NOT NULL,
  approval_class TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  route_policy_version TEXT NOT NULL,
  worker_profile_version TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hybrid_invocation_traces (
  id TEXT PRIMARY KEY,
  surface TEXT NOT NULL,
  session_id TEXT,
  scope_id TEXT,
  worker_task TEXT,
  route TEXT NOT NULL,
  route_policy_version TEXT NOT NULL,
  capsule_schema_version TEXT,
  worker_profile_version TEXT,
  rollout_mode TEXT NOT NULL,
  rollout_reason TEXT NOT NULL,
  worker_ran INTEGER NOT NULL DEFAULT 0,
  validation_status TEXT NOT NULL,
  output_action TEXT NOT NULL,
  fallback_reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experience_nodes (
  id TEXT PRIMARY KEY,
  node_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  experience_kind TEXT,
  confidence_signal TEXT,
  validation_state TEXT,
  correction_scope TEXT,
  correction_category TEXT,
  deviation_pattern TEXT,
  corrected_constraint TEXT,
  trigger_pattern TEXT NOT NULL,
  applicability_notes TEXT,
  env_signature TEXT,
  compact_hint TEXT NOT NULL,
  goal TEXT,
  recommended_steps_json TEXT,
  avoid_steps_json TEXT,
  fallback_steps_json TEXT,
  success_signal TEXT NOT NULL,
  stop_condition TEXT,
  escalation_condition TEXT,
  evidence_summary TEXT NOT NULL,
  retrieval_text TEXT,
  embedding_json TEXT,
  embedding_provider TEXT,
  embedding_model TEXT,
  embedding_version TEXT,
  embedding_dimensions INTEGER,
  distillation_mode_used TEXT,
  distillation_source TEXT,
  redistilled_from TEXT,
  promotion_signal TEXT,
  promotion_reason TEXT,
  merge_decision TEXT,
  merge_reason TEXT,
  priority_promotion_applied INTEGER NOT NULL DEFAULT 0,
  source_kind TEXT NOT NULL,
  origin_record_ids_json TEXT NOT NULL DEFAULT '[]',
  helped_record_ids_json TEXT NOT NULL DEFAULT '[]',
  harmed_record_ids_json TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL,
  delivery_state TEXT NOT NULL DEFAULT 'shadow_only',
  usage_count INTEGER NOT NULL DEFAULT 0,
  helped_count INTEGER NOT NULL DEFAULT 0,
  harmed_count INTEGER NOT NULL DEFAULT 0,
  consecutive_harmed_count INTEGER NOT NULL DEFAULT 0,
  last_feedback_verdict TEXT,
  support_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT,
  last_helped_at TEXT,
  last_harmed_at TEXT,
  quarantined_at TEXT,
  quarantine_reason TEXT,
  embedding_manifest_id TEXT,
  migration_status TEXT,
  migration_last_error TEXT,
  migration_updated_at TEXT,
  source_fingerprint_hash TEXT,
  portable_validation_evidence_json TEXT,
  quarantine_lease_expires_at TEXT,
  quarantine_original_delivery_state TEXT,
  quarantine_release_attempt_count INTEGER,
  quarantine_last_release_attempt_at TEXT,
  quarantine_release_reason TEXT,
  quarantine_no_harm_pass_count INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experience_candidates (
  id TEXT PRIMARY KEY,
  task_run_id TEXT,
  candidate_kind TEXT,
  source_record_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  node_type TEXT NOT NULL,
  experience_kind TEXT,
  confidence_signal TEXT,
  validation_state TEXT,
  correction_scope TEXT,
  correction_category TEXT,
  deviation_pattern TEXT,
  corrected_constraint TEXT,
  trigger_pattern TEXT NOT NULL,
  applicability_notes TEXT,
  env_signature TEXT,
  compact_hint TEXT NOT NULL,
  goal TEXT,
  recommended_steps_json TEXT,
  avoid_steps_json TEXT,
  fallback_steps_json TEXT,
  success_signal TEXT NOT NULL,
  stop_condition TEXT,
  escalation_condition TEXT,
  evidence_summary TEXT NOT NULL,
  retrieval_text TEXT,
  source_kind TEXT NOT NULL,
  source_context_summary TEXT,
  source_outcome_signal TEXT NOT NULL,
  raw_summary TEXT,
  failure_signature TEXT,
  source_signal_json TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  distilled_node_id TEXT,
  last_error TEXT,
  promotion_signal TEXT,
  promotion_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  distilled_at TEXT,
  discarded_at TEXT,
  last_failed_at TEXT
);

CREATE TABLE IF NOT EXISTS distillation_jobs (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  status TEXT NOT NULL,
  extractor_profile TEXT NOT NULL,
  distillation_source TEXT,
  failure_bucket TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  discarded_at TEXT
);

CREATE TABLE IF NOT EXISTS injection_events (
  injection_id TEXT PRIMARY KEY,
  episode_id TEXT,
  session_id TEXT,
  scope_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  task_summary TEXT,
  mode TEXT NOT NULL,
  delivery_mode TEXT NOT NULL DEFAULT 'live',
  delivered INTEGER NOT NULL DEFAULT 1,
  injected_node_ids_json TEXT NOT NULL,
  injection_count INTEGER NOT NULL,
  scorecard_json TEXT,
  was_successful INTEGER,
  harm_observed INTEGER,
  attribution_reason TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS attribution_records (
  id TEXT PRIMARY KEY,
  injection_id TEXT,
  node_id TEXT NOT NULL,
  episode_id TEXT,
  intervention_strength TEXT,
  injection_mode TEXT,
  delivery_mode TEXT,
  delivered INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  attribution_verdict TEXT NOT NULL,
  confidence TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  user_override TEXT,
  source TEXT NOT NULL,
  attribution_reason TEXT,
  trajectory_verdict TEXT,
  trajectory_confidence TEXT,
  trajectory_matched_expectations_json TEXT,
  trajectory_violated_expectations_json TEXT,
  trajectory_evidence_refs_json TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS repo_policies (
  scope_id TEXT PRIMARY KEY,
  configured_mode TEXT NOT NULL DEFAULT 'safe',
  effective_mode TEXT NOT NULL DEFAULT 'safe',
  circuit_state TEXT NOT NULL DEFAULT 'clear',
  circuit_reason TEXT,
  live_diagnostics_disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_tripped_at TEXT,
  restored_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_attribution_records_injection_id ON attribution_records(injection_id);
CREATE INDEX IF NOT EXISTS idx_attribution_records_node_id ON attribution_records(node_id);
CREATE INDEX IF NOT EXISTS idx_attribution_records_verdict ON attribution_records(attribution_verdict);
CREATE INDEX IF NOT EXISTS idx_attribution_records_created_at ON attribution_records(created_at);

CREATE TABLE IF NOT EXISTS scope_task_stats (
  scope_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  total_tasks INTEGER NOT NULL DEFAULT 0,
  success_tasks INTEGER NOT NULL DEFAULT 0,
  failed_tasks INTEGER NOT NULL DEFAULT 0,
  unknown_tasks INTEGER NOT NULL DEFAULT 0,
  injected_tasks INTEGER NOT NULL DEFAULT 0,
  injected_success_tasks INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope_id, task_type)
);

CREATE TABLE IF NOT EXISTS hygiene_governance_schedules (
  scope_id TEXT PRIMARY KEY,
  last_governed_at TEXT,
  next_due_at TEXT NOT NULL,
  pending_reasons_json TEXT NOT NULL DEFAULT '[]',
  last_run_status TEXT,
  last_failure_class TEXT,
  backoff_until TEXT,
  last_finding_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hygiene_governance_leases (
  scope_id TEXT PRIMARY KEY,
  lease_owner TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hygiene_governance_runs (
  run_id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  failure_class TEXT,
  failure_message TEXT,
  checkpoint_json TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hygiene_governance_plans (
  plan_id TEXT PRIMARY KEY,
  run_id TEXT,
  scope_id TEXT NOT NULL,
  status TEXT NOT NULL,
  finding_hash TEXT,
  risk TEXT,
  plan_json TEXT NOT NULL,
  validator_result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hygiene_governance_actions (
  action_id TEXT PRIMARY KEY,
  plan_id TEXT,
  run_id TEXT,
  scope_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL,
  affected_ids_json TEXT NOT NULL DEFAULT '[]',
  affected_row_hashes_json TEXT NOT NULL DEFAULT '{}',
  action_json TEXT NOT NULL DEFAULT '{}',
  validator_decision_json TEXT,
  before_snapshot_id TEXT,
  after_state_json TEXT,
  rollback_of_action_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  applied_at TEXT
);

CREATE TABLE IF NOT EXISTS hygiene_governance_approvals (
  approval_id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL,
  plan_id TEXT,
  scope_id TEXT NOT NULL,
  status TEXT NOT NULL,
  confirmation_token_hash TEXT,
  token_expires_at TEXT,
  diff_summary TEXT,
  affected_row_hashes_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS hygiene_governance_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  row_refs_json TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  row_hashes_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hygiene_governance_runs_scope ON hygiene_governance_runs(scope_id, created_at);
CREATE INDEX IF NOT EXISTS idx_hygiene_governance_plans_scope ON hygiene_governance_plans(scope_id, created_at);
CREATE INDEX IF NOT EXISTS idx_hygiene_governance_actions_scope ON hygiene_governance_actions(scope_id, created_at);
CREATE INDEX IF NOT EXISTS idx_hygiene_governance_approvals_scope ON hygiene_governance_approvals(scope_id, status);
CREATE INDEX IF NOT EXISTS idx_hygiene_governance_snapshots_action ON hygiene_governance_snapshots(action_id);
