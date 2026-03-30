import type {
  ExplainDecisionCapsule,
  ExplainDecisionWorkerOutput,
  HybridValidationFailure,
  HybridValidationSuccess,
  PostmortemReviewCapsule,
  PostmortemReviewWorkerOutput
} from "./types.js";
import { validateExplainDecisionOutput, validatePostmortemReviewOutput } from "./validators.js";
import { runExplainDecisionWorker } from "./workers/explain-decision.js";
import { runPostmortemReviewWorker } from "./workers/postmortem-review.js";

export type HybridExplainFallback =
  | {
      status: "fallback";
      reason: "disabled" | "timeout" | "circuit_open";
    }
  | {
      status: "fallback";
      reason: "validation_failed";
      validation: HybridValidationFailure;
    };

export type HybridExplainResult = HybridValidationSuccess<ExplainDecisionWorkerOutput> | HybridExplainFallback;

export type HybridPostmortemFallback =
  | {
      status: "fallback";
      reason: "disabled" | "timeout" | "circuit_open";
    }
  | {
      status: "fallback";
      reason: "validation_failed";
      validation: HybridValidationFailure;
    };

export type HybridPostmortemResult =
  | HybridValidationSuccess<PostmortemReviewWorkerOutput>
  | HybridPostmortemFallback;

type HybridWorkerClientOptions = {
  explainDecisionEnabled?: boolean;
  explainDecisionTimeoutMs?: number;
  explainDecisionExecutor?: (capsule: ExplainDecisionCapsule) => Promise<ExplainDecisionWorkerOutput> | ExplainDecisionWorkerOutput;
  postmortemReviewEnabled?: boolean;
  postmortemReviewTimeoutMs?: number;
  postmortemReviewExecutor?: (
    capsule: PostmortemReviewCapsule
  ) => Promise<PostmortemReviewWorkerOutput> | PostmortemReviewWorkerOutput;
  timeoutCircuitThreshold?: number;
};

const DEFAULT_TIMEOUT_MS = 150;
const DEFAULT_CIRCUIT_THRESHOLD = 3;

export class HybridWorkerClient {
  private readonly explainDecisionEnabled: boolean;
  private readonly explainDecisionTimeoutMs: number;
  private readonly explainDecisionExecutor: (
    capsule: ExplainDecisionCapsule
  ) => Promise<ExplainDecisionWorkerOutput> | ExplainDecisionWorkerOutput;
  private readonly postmortemReviewEnabled: boolean;
  private readonly postmortemReviewTimeoutMs: number;
  private readonly postmortemReviewExecutor: (
    capsule: PostmortemReviewCapsule
  ) => Promise<PostmortemReviewWorkerOutput> | PostmortemReviewWorkerOutput;
  private readonly timeoutCircuitThreshold: number;
  private explainTimeoutStreak = 0;
  private postmortemTimeoutStreak = 0;

  constructor(options: HybridWorkerClientOptions = {}) {
    this.explainDecisionEnabled = options.explainDecisionEnabled ?? true;
    this.explainDecisionTimeoutMs = options.explainDecisionTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.explainDecisionExecutor = options.explainDecisionExecutor ?? runExplainDecisionWorker;
    this.postmortemReviewEnabled = options.postmortemReviewEnabled ?? true;
    this.postmortemReviewTimeoutMs = options.postmortemReviewTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.postmortemReviewExecutor = options.postmortemReviewExecutor ?? runPostmortemReviewWorker;
    this.timeoutCircuitThreshold = options.timeoutCircuitThreshold ?? DEFAULT_CIRCUIT_THRESHOLD;
  }

  async runExplainDecision(capsule: ExplainDecisionCapsule): Promise<HybridExplainResult> {
    if (!this.explainDecisionEnabled) {
      return {
        status: "fallback",
        reason: "disabled"
      };
    }
    if (this.explainTimeoutStreak >= this.timeoutCircuitThreshold) {
      return {
        status: "fallback",
        reason: "circuit_open"
      };
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        Promise.resolve(this.explainDecisionExecutor(capsule)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), this.explainDecisionTimeoutMs);
        })
      ]);
      const validated = validateExplainDecisionOutput(result);
      if (validated.status === "rejected") {
        this.explainTimeoutStreak = 0;
        return {
          status: "fallback",
          reason: "validation_failed",
          validation: validated
        };
      }

      this.explainTimeoutStreak = 0;
      return validated;
    } catch (error) {
      if (error instanceof Error && error.message === "timeout") {
        this.explainTimeoutStreak += 1;
        return {
          status: "fallback",
          reason: "timeout"
        };
      }

      this.explainTimeoutStreak = 0;
      return {
        status: "fallback",
        reason: "validation_failed",
        validation: {
          status: "rejected",
          reason: "policy_violation",
          detail: error instanceof Error ? error.message : String(error)
        }
      };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  async runPostmortemReview(capsule: PostmortemReviewCapsule): Promise<HybridPostmortemResult> {
    if (!this.postmortemReviewEnabled) {
      return {
        status: "fallback",
        reason: "disabled"
      };
    }
    if (this.postmortemTimeoutStreak >= this.timeoutCircuitThreshold) {
      return {
        status: "fallback",
        reason: "circuit_open"
      };
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        Promise.resolve(this.postmortemReviewExecutor(capsule)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), this.postmortemReviewTimeoutMs);
        })
      ]);
      const validated = validatePostmortemReviewOutput(result);
      if (validated.status === "rejected") {
        this.postmortemTimeoutStreak = 0;
        return {
          status: "fallback",
          reason: "validation_failed",
          validation: validated
        };
      }

      this.postmortemTimeoutStreak = 0;
      return validated;
    } catch (error) {
      if (error instanceof Error && error.message === "timeout") {
        this.postmortemTimeoutStreak += 1;
        return {
          status: "fallback",
          reason: "timeout"
        };
      }

      this.postmortemTimeoutStreak = 0;
      return {
        status: "fallback",
        reason: "validation_failed",
        validation: {
          status: "rejected",
          reason: "policy_violation",
          detail: error instanceof Error ? error.message : String(error)
        }
      };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
