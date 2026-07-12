import {
  FENCED_LEARNING_QUEUE_CONTRACT_VERSION,
  FENCED_LEARNING_QUEUE_STAGE,
  ROUTE_FAILURE_ESCALATION_POLICY_VERSION
} from "./constants.js";

export type FencedLearningQueueInspection = {
  stage: typeof FENCED_LEARNING_QUEUE_STAGE;
  contract_version: typeof FENCED_LEARNING_QUEUE_CONTRACT_VERSION;
  fenced_queue_semantics_implemented: true;
  separate_retry_counters_implemented: true;
  semantic_origin_provenance_implemented: true;
  custom_shadow_cap_implemented: true;
  route_failure_escalation_policy_version:
    typeof ROUTE_FAILURE_ESCALATION_POLICY_VERSION;
  production_write_authority_connected: false;
  production_queue_claiming_enabled: false;
  semantic_production_writes_enabled: false;
  production_learning_ready: false;
  learning_runtime_active: false;
};

export const inspectFencedLearningQueueAuthority = (): FencedLearningQueueInspection => ({
  stage: FENCED_LEARNING_QUEUE_STAGE,
  contract_version: FENCED_LEARNING_QUEUE_CONTRACT_VERSION,
  fenced_queue_semantics_implemented: true,
  separate_retry_counters_implemented: true,
  semantic_origin_provenance_implemented: true,
  custom_shadow_cap_implemented: true,
  route_failure_escalation_policy_version:
    ROUTE_FAILURE_ESCALATION_POLICY_VERSION,
  production_write_authority_connected: false,
  production_queue_claiming_enabled: false,
  semantic_production_writes_enabled: false,
  production_learning_ready: false,
  learning_runtime_active: false
});

