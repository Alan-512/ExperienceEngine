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
  trace_capsule_id TEXT,
  trace_completeness REAL,
  trace_provenance_json TEXT,
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
  trace_capsule_id TEXT,
  trace_completeness REAL,
  trace_provenance_json TEXT,
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
  contains_unbenchmarked_origin INTEGER NOT NULL DEFAULT 0,
  contains_revoked_profile_origin INTEGER NOT NULL DEFAULT 0,
  semantic_origin_count INTEGER NOT NULL DEFAULT 0,
  exact_provenance_key_count INTEGER NOT NULL DEFAULT 0,
  compacted_provenance_origin_count INTEGER NOT NULL DEFAULT 0,
  effective_generation_assurance_floor TEXT,
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
  state_revision INTEGER NOT NULL DEFAULT 1,
  content_retry_count INTEGER NOT NULL DEFAULT 0,
  failure_code TEXT,
  failure_class TEXT,
  failure_scope TEXT,
  blocked_at TEXT,
  terminal_reason_code TEXT,
  semantic_origin_provenance_key TEXT,
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
  home_id TEXT,
  state_revision INTEGER NOT NULL DEFAULT 1,
  claim_id TEXT,
  claim_owner_id TEXT,
  claim_fencing_token INTEGER,
  claimed_supervisor_owner_id TEXT,
  claimed_supervisor_lease_epoch INTEGER,
  claimed_package_generation_id TEXT,
  claimed_activation_revision INTEGER,
  claimed_production_activation_handshake_id TEXT,
  claimed_configuration_generation_id TEXT,
  claimed_effective_route_set_id TEXT,
  claimed_effective_route_revision INTEGER,
  claimed_capability TEXT,
  claimed_route_fingerprint TEXT,
  claimed_schema_version TEXT,
  claimed_job_schema_version TEXT,
  claimed_candidate_schema_version TEXT,
  claimed_node_schema_version TEXT,
  claimed_at TEXT,
  claim_heartbeat_at TEXT,
  claim_expires_at TEXT,
  failure_code TEXT,
  failure_class TEXT,
  failure_scope TEXT,
  system_attempt_count INTEGER NOT NULL DEFAULT 0,
  interruption_count INTEGER NOT NULL DEFAULT 0,
  content_retry_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
  blocked_at TEXT,
  route_fingerprint TEXT NOT NULL DEFAULT '',
  terminal_reason_code TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  discarded_at TEXT
);

CREATE TABLE IF NOT EXISTS candidate_semantic_origin_provenance (
  candidate_id TEXT PRIMARY KEY,
  provenance_key TEXT NOT NULL,
  provenance_schema_version TEXT NOT NULL,
  configuration_generation_id TEXT NOT NULL,
  package_generation_id TEXT NOT NULL,
  generation_profile_id TEXT NOT NULL,
  generation_profile_version TEXT NOT NULL,
  generation_profile_status TEXT NOT NULL,
  quality_profile TEXT NOT NULL,
  stage_routes_json TEXT NOT NULL,
  assurance_floor TEXT NOT NULL,
  origin_record_count INTEGER NOT NULL,
  first_origin_at TEXT NOT NULL,
  last_origin_at TEXT NOT NULL,
  FOREIGN KEY(candidate_id) REFERENCES experience_candidates(id) ON DELETE CASCADE,
  CHECK (origin_record_count >= 1),
  CHECK (assurance_floor IN ('unbenchmarked', 'supported', 'recommended')),
  CHECK (generation_profile_status IN ('active', 'deprecated', 'revoked')),
  CHECK (quality_profile IN ('evaluated_recommended', 'custom'))
);

CREATE TABLE IF NOT EXISTS node_semantic_origin_provenance (
  node_id TEXT NOT NULL,
  provenance_key TEXT NOT NULL,
  provenance_schema_version TEXT NOT NULL,
  configuration_generation_id TEXT NOT NULL,
  package_generation_id TEXT NOT NULL,
  generation_profile_id TEXT NOT NULL,
  generation_profile_version TEXT NOT NULL,
  generation_profile_status TEXT NOT NULL,
  quality_profile TEXT NOT NULL,
  stage_routes_json TEXT NOT NULL,
  assurance_floor TEXT NOT NULL,
  origin_record_count INTEGER NOT NULL,
  first_origin_at TEXT NOT NULL,
  last_origin_at TEXT NOT NULL,
  PRIMARY KEY(node_id, provenance_key),
  FOREIGN KEY(node_id) REFERENCES experience_nodes(id) ON DELETE CASCADE,
  CHECK (origin_record_count >= 1),
  CHECK (assurance_floor IN ('unbenchmarked', 'supported', 'recommended')),
  CHECK (generation_profile_status IN ('active', 'deprecated', 'revoked')),
  CHECK (quality_profile IN ('evaluated_recommended', 'custom'))
);

CREATE TABLE IF NOT EXISTS node_semantic_origin_buckets (
  node_id TEXT NOT NULL,
  bucket_key TEXT NOT NULL,
  compaction_schema_version TEXT NOT NULL,
  generation_profile_id TEXT NOT NULL,
  generation_profile_version TEXT NOT NULL,
  assurance_floor TEXT NOT NULL,
  contract_versions_json TEXT NOT NULL,
  origin_record_count INTEGER NOT NULL,
  first_origin_at TEXT NOT NULL,
  last_origin_at TEXT NOT NULL,
  worst_assurance TEXT NOT NULL,
  rolling_digest TEXT NOT NULL,
  contains_unbenchmarked_origin INTEGER NOT NULL DEFAULT 0,
  contains_revoked_profile_origin INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(node_id, bucket_key),
  FOREIGN KEY(node_id) REFERENCES experience_nodes(id) ON DELETE CASCADE,
  CHECK (origin_record_count >= 1),
  CHECK (assurance_floor IN ('unbenchmarked', 'supported', 'recommended')),
  CHECK (worst_assurance IN ('unbenchmarked', 'supported', 'recommended')),
  CHECK (contains_unbenchmarked_origin IN (0, 1)),
  CHECK (contains_revoked_profile_origin IN (0, 1))
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

CREATE TABLE IF NOT EXISTS trace_capsules (
  id TEXT PRIMARY KEY,
  episode_id TEXT,
  task_run_id TEXT,
  scope_id TEXT NOT NULL,
  session_id TEXT,
  task_json TEXT NOT NULL,
  outcome_json TEXT NOT NULL,
  capture_metadata_json TEXT NOT NULL,
  host_profile_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trace_events (
  id TEXT PRIMARY KEY,
  trace_capsule_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  source_json TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (trace_capsule_id) REFERENCES trace_capsules(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trace_evidence_refs (
  id TEXT PRIMARY KEY,
  trace_capsule_id TEXT NOT NULL,
  ref_type TEXT NOT NULL,
  path_or_uri TEXT NOT NULL,
  content_hash TEXT,
  summary TEXT,
  is_redacted INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER,
  FOREIGN KEY (trace_capsule_id) REFERENCES trace_capsules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trace_capsules_episode_id ON trace_capsules(episode_id);
CREATE INDEX IF NOT EXISTS idx_trace_capsules_task_run_id ON trace_capsules(task_run_id);
CREATE INDEX IF NOT EXISTS idx_trace_capsules_session_id ON trace_capsules(session_id);
CREATE INDEX IF NOT EXISTS idx_trace_events_capsule_id ON trace_events(trace_capsule_id);
CREATE INDEX IF NOT EXISTS idx_trace_evidence_refs_capsule_id ON trace_evidence_refs(trace_capsule_id);

CREATE TABLE IF NOT EXISTS host_capability_probes (
  host TEXT NOT NULL,
  capability TEXT NOT NULL,
  state TEXT NOT NULL,
  provenance TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (host, capability)
);

CREATE TRIGGER IF NOT EXISTS trg_distillation_jobs_contract_insert
BEFORE INSERT ON distillation_jobs
BEGIN
  SELECT CASE
    WHEN NEW.status NOT IN ('pending', 'processing', 'blocked', 'failed', 'succeeded', 'discarded')
      THEN RAISE(ABORT, 'invalid learning job state')
    WHEN NEW.state_revision < 1 OR
         NEW.system_attempt_count < 0 OR
         NEW.interruption_count < 0 OR
         NEW.content_retry_count < 0
      THEN RAISE(ABORT, 'invalid learning job revision or counter')
    WHEN NEW.status = 'processing' AND NEW.home_id IS NOT NULL AND (
      NEW.claim_id IS NULL OR
      NEW.claim_owner_id IS NULL OR
      NEW.claim_fencing_token IS NULL OR
      NEW.claimed_supervisor_owner_id IS NULL OR
      NEW.claimed_supervisor_lease_epoch IS NULL OR
      NEW.claimed_package_generation_id IS NULL OR
      NEW.claimed_activation_revision IS NULL OR
      NEW.claimed_production_activation_handshake_id IS NULL OR
      NEW.claimed_configuration_generation_id IS NULL OR
      NEW.claimed_effective_route_set_id IS NULL OR
      NEW.claimed_effective_route_revision IS NULL OR
      NEW.claimed_capability IS NULL OR
      NEW.claimed_route_fingerprint IS NULL OR
      NEW.claimed_schema_version IS NULL OR
      NEW.claimed_job_schema_version IS NULL OR
      NEW.claimed_candidate_schema_version IS NULL OR
      NEW.claimed_node_schema_version IS NULL OR
      NEW.claimed_at IS NULL OR
      NEW.claim_heartbeat_at IS NULL OR
      NEW.claim_expires_at IS NULL
    ) THEN RAISE(ABORT, 'processing job requires complete claim identity')
    WHEN NEW.status = 'processing' AND NEW.home_id IS NULL AND (
      NEW.claim_id IS NOT NULL OR
      NEW.claim_owner_id IS NOT NULL OR
      NEW.claim_fencing_token IS NOT NULL
    ) THEN RAISE(ABORT, 'legacy processing job cannot persist fenced claim identity')
    WHEN NEW.status <> 'processing' AND (
      NEW.claim_id IS NOT NULL OR
      NEW.claim_owner_id IS NOT NULL OR
      NEW.claim_fencing_token IS NOT NULL OR
      NEW.claimed_supervisor_owner_id IS NOT NULL OR
      NEW.claimed_supervisor_lease_epoch IS NOT NULL OR
      NEW.claimed_package_generation_id IS NOT NULL OR
      NEW.claimed_activation_revision IS NOT NULL OR
      NEW.claimed_production_activation_handshake_id IS NOT NULL OR
      NEW.claimed_configuration_generation_id IS NOT NULL OR
      NEW.claimed_effective_route_set_id IS NOT NULL OR
      NEW.claimed_effective_route_revision IS NOT NULL OR
      NEW.claimed_capability IS NOT NULL OR
      NEW.claimed_route_fingerprint IS NOT NULL OR
      NEW.claimed_schema_version IS NOT NULL OR
      NEW.claimed_job_schema_version IS NOT NULL OR
      NEW.claimed_candidate_schema_version IS NOT NULL OR
      NEW.claimed_node_schema_version IS NOT NULL OR
      NEW.claimed_at IS NOT NULL OR
      NEW.claim_heartbeat_at IS NOT NULL OR
      NEW.claim_expires_at IS NOT NULL
    ) THEN RAISE(ABORT, 'non-processing job cannot retain claim identity')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_distillation_jobs_contract_update
BEFORE UPDATE ON distillation_jobs
BEGIN
  SELECT CASE
    WHEN NEW.status NOT IN ('pending', 'processing', 'blocked', 'failed', 'succeeded', 'discarded')
      THEN RAISE(ABORT, 'invalid learning job state')
    WHEN NEW.state_revision < 1 OR
         NEW.system_attempt_count < 0 OR
         NEW.interruption_count < 0 OR
         NEW.content_retry_count < 0
      THEN RAISE(ABORT, 'invalid learning job revision or counter')
    WHEN NEW.status = 'processing' AND NEW.home_id IS NOT NULL AND (
      NEW.claim_id IS NULL OR
      NEW.claim_owner_id IS NULL OR
      NEW.claim_fencing_token IS NULL OR
      NEW.claimed_supervisor_owner_id IS NULL OR
      NEW.claimed_supervisor_lease_epoch IS NULL OR
      NEW.claimed_package_generation_id IS NULL OR
      NEW.claimed_activation_revision IS NULL OR
      NEW.claimed_production_activation_handshake_id IS NULL OR
      NEW.claimed_configuration_generation_id IS NULL OR
      NEW.claimed_effective_route_set_id IS NULL OR
      NEW.claimed_effective_route_revision IS NULL OR
      NEW.claimed_capability IS NULL OR
      NEW.claimed_route_fingerprint IS NULL OR
      NEW.claimed_schema_version IS NULL OR
      NEW.claimed_job_schema_version IS NULL OR
      NEW.claimed_candidate_schema_version IS NULL OR
      NEW.claimed_node_schema_version IS NULL OR
      NEW.claimed_at IS NULL OR
      NEW.claim_heartbeat_at IS NULL OR
      NEW.claim_expires_at IS NULL
    ) THEN RAISE(ABORT, 'processing job requires complete claim identity')
    WHEN NEW.status = 'processing' AND NEW.home_id IS NULL AND (
      NEW.claim_id IS NOT NULL OR
      NEW.claim_owner_id IS NOT NULL OR
      NEW.claim_fencing_token IS NOT NULL
    ) THEN RAISE(ABORT, 'legacy processing job cannot persist fenced claim identity')
    WHEN NEW.status <> 'processing' AND (
      NEW.claim_id IS NOT NULL OR
      NEW.claim_owner_id IS NOT NULL OR
      NEW.claim_fencing_token IS NOT NULL OR
      NEW.claimed_supervisor_owner_id IS NOT NULL OR
      NEW.claimed_supervisor_lease_epoch IS NOT NULL OR
      NEW.claimed_package_generation_id IS NOT NULL OR
      NEW.claimed_activation_revision IS NOT NULL OR
      NEW.claimed_production_activation_handshake_id IS NOT NULL OR
      NEW.claimed_configuration_generation_id IS NOT NULL OR
      NEW.claimed_effective_route_set_id IS NOT NULL OR
      NEW.claimed_effective_route_revision IS NOT NULL OR
      NEW.claimed_capability IS NOT NULL OR
      NEW.claimed_route_fingerprint IS NOT NULL OR
      NEW.claimed_schema_version IS NOT NULL OR
      NEW.claimed_job_schema_version IS NOT NULL OR
      NEW.claimed_candidate_schema_version IS NOT NULL OR
      NEW.claimed_node_schema_version IS NOT NULL OR
      NEW.claimed_at IS NOT NULL OR
      NEW.claim_heartbeat_at IS NOT NULL OR
      NEW.claim_expires_at IS NOT NULL
    ) THEN RAISE(ABORT, 'non-processing job cannot retain claim identity')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_experience_candidates_s5_contract_insert
BEFORE INSERT ON experience_candidates
BEGIN
  SELECT CASE
    WHEN NEW.lifecycle_state NOT IN ('pending', 'blocked', 'failed', 'distilled', 'discarded')
      THEN RAISE(ABORT, 'invalid learning candidate state')
    WHEN NEW.state_revision < 1 OR NEW.content_retry_count < 0
      THEN RAISE(ABORT, 'invalid learning candidate revision or counter')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_experience_candidates_s5_contract_update
BEFORE UPDATE ON experience_candidates
BEGIN
  SELECT CASE
    WHEN NEW.lifecycle_state NOT IN ('pending', 'blocked', 'failed', 'distilled', 'discarded')
      THEN RAISE(ABORT, 'invalid learning candidate state')
    WHEN NEW.state_revision < 1 OR NEW.content_retry_count < 0
      THEN RAISE(ABORT, 'invalid learning candidate revision or counter')
  END;
END;
