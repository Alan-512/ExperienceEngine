import type { DatabaseSync } from "node:sqlite";
import { RuntimeProcessAuthorityError } from "./errors.js";
import type { RuntimeProcessAuthorityClock } from "./types.js";

const assertIsoTimestamp = (value: string): string => {
  if (!Number.isFinite(Date.parse(value))) {
    throw new RuntimeProcessAuthorityError(
      "EE_PROCESS_AUTHORITY_INVALID",
      `Invalid process-authority timestamp: ${value}.`
    );
  }
  return value;
};

export const SYSTEM_PROCESS_AUTHORITY_CLOCK: RuntimeProcessAuthorityClock = Object.freeze({
  captureObservedNowInTransaction(db: DatabaseSync): string {
    if (!db.isTransaction) {
      throw new RuntimeProcessAuthorityError(
        "EE_PROCESS_AUTHORITY_INVALID",
        "Process-authority time must be captured inside the governing SQLite transaction."
      );
    }
    return new Date().toISOString();
  }
});

export const createFixedProcessAuthorityClock = (
  observedAt: string
): RuntimeProcessAuthorityClock => Object.freeze({
  captureObservedNowInTransaction(db: DatabaseSync): string {
    if (!db.isTransaction) {
      throw new RuntimeProcessAuthorityError(
        "EE_PROCESS_AUTHORITY_INVALID",
        "Fixed process-authority time must be captured inside the governing SQLite transaction."
      );
    }
    return assertIsoTimestamp(observedAt);
  }
});

export const toProcessAuthorityEpochMs = (value: string): number => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new RuntimeProcessAuthorityError(
      "EE_PROCESS_AUTHORITY_INVALID",
      `Invalid process-authority timestamp: ${value}.`
    );
  }
  return parsed;
};
