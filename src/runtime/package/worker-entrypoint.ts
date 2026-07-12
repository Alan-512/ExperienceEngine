import {
  RUNTIME_PROCESS_AUTHORITY_STAGE
} from "../process/constants.js";
import {
  consumeGatewayRuntimeIdentityEnvelope
} from "../identity/binding.js";

export const PACKAGE_LOCAL_WORKER_ENTRYPOINT = Object.freeze({
  role: "package_local_worker",
  stage: RUNTIME_PROCESS_AUTHORITY_STAGE,
  workerLeaseImplemented: true,
  workerAcquisitionAuthorityConnected: false,
  productionQueueImplemented: false,
  semanticWritesImplemented: false
});

export const consumeWorkerIdentityEnvelope = consumeGatewayRuntimeIdentityEnvelope;
