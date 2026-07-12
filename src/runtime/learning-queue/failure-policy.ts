import {
  LEARNING_FAILURE_POLICIES,
  ROUTE_FAILURE_ESCALATION_POLICY_VERSION
} from "./constants.js";
import { LearningQueueError } from "./errors.js";
import type { LearningFailureCode } from "./constants.js";

export type LearningFailureObservationSource =
  | "provider_execution"
  | "candidate_validation"
  | "initialization_validation"
  | "route_health_probe"
  | "embedding_execution"
  | "sqlite"
  | "authority"
  | "operator"
  | "setup";

export const resolveLearningFailurePolicy = (options: {
  code: LearningFailureCode;
  source: LearningFailureObservationSource;
}) => {
  if (
    options.code === "EE_ROUTE_OUTPUT_SCHEMA_INVALID" &&
    options.source !== "initialization_validation" &&
    options.source !== "route_health_probe"
  ) {
    throw new LearningQueueError(
      "EE_LEARNING_QUEUE_CONTRACT_INVALID",
      `${ROUTE_FAILURE_ESCALATION_POLICY_VERSION} forbids candidate failures from asserting route schema invalidity.`
    );
  }
  if (
    (
      options.code === "EE_CANDIDATE_OUTPUT_SCHEMA_INVALID" ||
      options.code === "EE_CANDIDATE_CONTENT_INVALID"
    ) &&
    options.source !== "candidate_validation"
  ) {
    throw new LearningQueueError(
      "EE_LEARNING_QUEUE_CONTRACT_INVALID",
      `${options.code} requires an explicit candidate-validation source.`
    );
  }
  return LEARNING_FAILURE_POLICIES[options.code];
};

export const assertFailureMetadataMatchesPolicy = (options: {
  code: LearningFailureCode;
  failureClass: string | null;
  failureScope: string | null;
}): void => {
  const policy = LEARNING_FAILURE_POLICIES[options.code];
  if (
    options.failureClass !== policy.failure_class ||
    options.failureScope !== policy.failure_scope
  ) {
    throw new LearningQueueError(
      "EE_LEARNING_QUEUE_CONTRACT_INVALID",
      `Failure metadata for ${options.code} does not match the frozen one-code/one-class/one-scope mapping.`
    );
  }
};

