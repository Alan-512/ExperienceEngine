import {
  RUNTIME_PROCESS_AUTHORITY_STAGE
} from "../process/constants.js";
import {
  consumeGatewayRuntimeIdentityEnvelope
} from "../identity/binding.js";
import {
  FENCED_LEARNING_QUEUE_STAGE
} from "../learning-queue/constants.js";
import { pathToFileURL } from "node:url";
import {
  runPackageLocalWorkerProcess
} from "./worker-runtime.js";

export const PACKAGE_LOCAL_WORKER_ENTRYPOINT = Object.freeze({
  role: "package_local_worker",
  stage: FENCED_LEARNING_QUEUE_STAGE,
  processAuthorityStage: RUNTIME_PROCESS_AUTHORITY_STAGE,
  workerLeaseImplemented: true,
  executableLeaseLifecycleConnected: true,
  workerAcquisitionAuthorityConnected: true,
  fencedQueueSemanticsImplemented: true,
  separateRetryCountersImplemented: true,
  semanticOriginProvenanceImplemented: true,
  productionWriteAuthorityProviderPackaged: true,
  activationHandshakeAcknowledgementConnected: true,
  productionWriteAuthorityConnected: true,
  productionQueueImplemented: true,
  semanticWritesImplemented: true
});

export const consumeWorkerIdentityEnvelope = consumeGatewayRuntimeIdentityEnvelope;

const isDirectExecution = (): boolean => Boolean(
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
);

if (isDirectExecution()) {
  const reportFailure = (error: unknown): void => {
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`
    );
  };
  void runPackageLocalWorkerProcess({
    onFailure: reportFailure
  }).catch((error) => {
    reportFailure(error);
    process.exitCode = 1;
  });
}
