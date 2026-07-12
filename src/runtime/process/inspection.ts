import {
  PROCESS_AUTHORITY_PRODUCTION_CAPABILITIES,
  RUNTIME_PROCESS_AUTHORITY_STAGE
} from "./constants.js";
import type {
  SupervisorAuthorityEvidence,
  WorkerLeaseRow
} from "./types.js";

export type RuntimeProcessAuthorityInspection = {
  stage: typeof RUNTIME_PROCESS_AUTHORITY_STAGE;
  supervisor_authority: SupervisorAuthorityEvidence;
  worker_authority_present: boolean;
  worker_fencing_token: number | null;
  package_authorization_issuer_connected: false;
  worker_acquisition_authority_connected: false;
  production_activation_connected: false;
  queue_claiming_enabled: false;
  semantic_writes_enabled: false;
  production_learning_ready: false;
  learning_runtime_active: false;
};

export const inspectRuntimeProcessAuthority = (options: {
  supervisorAuthority: SupervisorAuthorityEvidence;
  workerLease?: WorkerLeaseRow;
}): RuntimeProcessAuthorityInspection => ({
  stage: RUNTIME_PROCESS_AUTHORITY_STAGE,
  supervisor_authority: options.supervisorAuthority,
  worker_authority_present: Boolean(options.workerLease),
  worker_fencing_token: options.workerLease?.fencing_token ?? null,
  ...PROCESS_AUTHORITY_PRODUCTION_CAPABILITIES
});
