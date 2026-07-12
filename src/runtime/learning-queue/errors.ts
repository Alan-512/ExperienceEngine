import type { LearningFailureCode } from "./constants.js";

export type LearningQueueErrorCode =
  | LearningFailureCode
  | "EE_LEARNING_QUEUE_CONTRACT_INVALID"
  | "EE_PRODUCTION_WRITE_AUTHORITY_UNAVAILABLE"
  | "EE_PRODUCTION_WRITE_AUTHORITY_MISMATCH"
  | "EE_LEARNING_QUEUE_MAINTENANCE_AUTHORITY_UNAVAILABLE"
  | "EE_LEARNING_QUEUE_CAS_CONFLICT"
  | "EE_LEARNING_QUEUE_STATE_INVALID"
  | "EE_SEMANTIC_ORIGIN_INVALID"
  | "EE_SEMANTIC_COMPLETION_INVALID";

export class LearningQueueError extends Error {
  constructor(
    readonly code: LearningQueueErrorCode,
    message: string
  ) {
    super(message);
    this.name = "LearningQueueError";
  }
}

