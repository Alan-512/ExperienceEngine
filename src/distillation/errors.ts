import type {
  LearningFailureCode
} from "../runtime/learning-queue/constants.js";
import type {
  LearningFailureObservationSource
} from "../runtime/learning-queue/failure-policy.js";

export class DistillationExecutionError extends Error {
  constructor(
    readonly bucket: string,
    message: string,
    readonly code: LearningFailureCode,
    readonly source: LearningFailureObservationSource,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "DistillationExecutionError";
  }
}

export const getDistillationFailureBucket = (error: unknown): string =>
  error instanceof DistillationExecutionError ? error.bucket : "distillation_failed";

export type DistillationFailureClassification = {
  code: LearningFailureCode;
  source: LearningFailureObservationSource;
  compatibilityBucket: string;
  message: string;
};

export const classifyDistillationFailure = (
  error: unknown
): DistillationFailureClassification => {
  if (error instanceof DistillationExecutionError) {
    return {
      code: error.code,
      source: error.source,
      compatibilityBucket: error.bucket,
      message: error.message
    };
  }
  return {
    code: "EE_PROVIDER_CONTRACT_INVALID",
    source: "provider_execution",
    compatibilityBucket: getDistillationFailureBucket(error),
    message: error instanceof Error ? error.message : String(error)
  };
};
