import {
  RUNTIME_PROCESS_AUTHORITY_STAGE
} from "../process/constants.js";
import {
  consumeGatewayRuntimeIdentityEnvelope
} from "../identity/binding.js";

export const PACKAGE_LOCAL_SUPERVISOR_ENTRYPOINT = Object.freeze({
  role: "package_local_supervisor",
  stage: RUNTIME_PROCESS_AUTHORITY_STAGE,
  processAuthorityImplemented: true,
  migrationAuthorityProviderImplemented: true,
  packageAuthorizationIssuerConnected: false,
  productionActivationImplemented: false
});

export const consumeSupervisorIdentityEnvelope = consumeGatewayRuntimeIdentityEnvelope;
