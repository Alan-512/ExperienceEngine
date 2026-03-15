CREATE TABLE IF NOT EXISTS scopes (
  scope_id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_name TEXT NOT NULL,
  root_path TEXT,
  is_disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experience_input_records (
  record_id TEXT PRIMARY KEY,
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

CREATE TABLE IF NOT EXISTS experience_nodes (
  id TEXT PRIMARY KEY,
  node_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
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
  source_kind TEXT NOT NULL,
  origin_record_ids_json TEXT NOT NULL DEFAULT '[]',
  helped_record_ids_json TEXT NOT NULL DEFAULT '[]',
  harmed_record_ids_json TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  helped_count INTEGER NOT NULL DEFAULT 0,
  harmed_count INTEGER NOT NULL DEFAULT 0,
  support_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT,
  last_helped_at TEXT,
  last_harmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experience_candidates (
  id TEXT PRIMARY KEY,
  source_record_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  node_type TEXT NOT NULL,
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
  source_signal_json TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  distilled_node_id TEXT,
  last_error TEXT,
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
  scope_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  mode TEXT NOT NULL,
  injected_node_ids_json TEXT NOT NULL,
  injection_count INTEGER NOT NULL,
  was_successful INTEGER,
  harm_observed INTEGER,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

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
