import {
  RUNTIME_PROCESS_AUTHORITY_STAGE
} from "../process/constants.js";
import {
  consumeGatewayRuntimeIdentityEnvelope
} from "../identity/binding.js";
import {
  FENCED_LEARNING_QUEUE_STAGE
} from "../learning-queue/constants.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  runPackageLocalSupervisorProcess
} from "./supervisor-runtime.js";

export const PACKAGE_LOCAL_SUPERVISOR_ENTRYPOINT = Object.freeze({
  role: "package_local_supervisor",
  stage: FENCED_LEARNING_QUEUE_STAGE,
  processAuthorityStage: RUNTIME_PROCESS_AUTHORITY_STAGE,
  processAuthorityImplemented: true,
  migrationAuthorityProviderImplemented: true,
  fencedQueueMaintenanceConsumerImplemented: true,
  productionActivationAuthorityPackaged: true,
  activationHandshakeOrchestratorPackaged: true,
  nativeControlServicePackaged: true,
  productionWriteAuthorityProviderConnected: false,
  packageAuthorizationIssuerConnected: false,
  executableLeaseLifecycleConnected: true,
  productionActivationImplemented: false
});

export const consumeSupervisorIdentityEnvelope = consumeGatewayRuntimeIdentityEnvelope;

const isDirectExecution = (): boolean => {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint) && resolve(entrypoint) === resolve(fileURLToPath(import.meta.url));
};

if (isDirectExecution()) {
  void runPackageLocalSupervisorProcess().catch((error) => {
    console.error("experienceengine.package_local_supervisor_failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  });
}
