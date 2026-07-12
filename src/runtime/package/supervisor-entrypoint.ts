import {
  RUNTIME_PROCESS_AUTHORITY_STAGE
} from "../process/constants.js";
import {
  consumeGatewayRuntimeIdentityEnvelope
} from "../identity/binding.js";
import {
  FENCED_LEARNING_QUEUE_STAGE
} from "../learning-queue/constants.js";

export const PACKAGE_LOCAL_SUPERVISOR_ENTRYPOINT = Object.freeze({
  role: "package_local_supervisor",
  stage: FENCED_LEARNING_QUEUE_STAGE,
  processAuthorityStage: RUNTIME_PROCESS_AUTHORITY_STAGE,
  processAuthorityImplemented: true,
  migrationAuthorityProviderImplemented: true,
  fencedQueueMaintenanceConsumerImplemented: true,
  productionWriteAuthorityProviderConnected: false,
  packageAuthorizationIssuerConnected: false,
  productionActivationImplemented: false
});

export const consumeSupervisorIdentityEnvelope = consumeGatewayRuntimeIdentityEnvelope;
