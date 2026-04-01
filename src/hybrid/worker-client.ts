import type {
  ExplainDecisionCapsule,
  ExplainDecisionWorkerOutput,
  HybridValidationFailure,
  HybridValidationSuccess,
  PostmortemReviewCapsule,
  PostmortemReviewWorkerOutput
} from "./types.js";
import type { DistillerEndpoint } from "../distillation/providers/types.js";
import { validateExplainDecisionOutput, validatePostmortemReviewOutput } from "./validators.js";
import { runExplainDecisionWorker } from "./workers/explain-decision.js";
import { runExplainDecisionLlmWorker } from "./workers/explain-decision-llm.js";
import { runPostmortemReviewWorker } from "./workers/postmortem-review.js";
import { runPostmortemReviewLlmWorker } from "./workers/postmortem-review-llm.js";

export type HybridExplainFallback =
  | {
      status: "fallback";
      reason: "disabled" | "timeout" | "circuit_open" | "provider_unavailable";
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
      reason: "disabled" | "timeout" | "circuit_open" | "provider_unavailable";
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
  explainDecisionProviderTimeoutMs?: number;
  explainDecisionExecutor?: (capsule: ExplainDecisionCapsule) => Promise<ExplainDecisionWorkerOutput> | ExplainDecisionWorkerOutput;
  explainDecisionLlmEnabled?: boolean;
  explainDecisionLlmExecutor?: (
    capsule: ExplainDecisionCapsule,
    endpoint: DistillerEndpoint
  ) => Promise<ExplainDecisionWorkerOutput> | ExplainDecisionWorkerOutput;
  postmortemReviewEnabled?: boolean;
  postmortemReviewTimeoutMs?: number;
  postmortemReviewProviderTimeoutMs?: number;
  postmortemReviewExecutor?: (
    capsule: PostmortemReviewCapsule
  ) => Promise<PostmortemReviewWorkerOutput> | PostmortemReviewWorkerOutput;
  postmortemReviewLlmEnabled?: boolean;
  postmortemReviewLlmExecutor?: (
    capsule: PostmortemReviewCapsule,
    endpoint: DistillerEndpoint
  ) => Promise<PostmortemReviewWorkerOutput> | PostmortemReviewWorkerOutput;
  timeoutCircuitThreshold?: number;
};

const DEFAULT_TIMEOUT_MS = 150;
const DEFAULT_PROVIDER_TIMEOUT_MS = 5000;
const DEFAULT_CIRCUIT_THRESHOLD = 3;

export class HybridWorkerClient {
  private readonly explainDecisionEnabled: boolean;
  private readonly explainDecisionTimeoutMs: number;
  private readonly explainDecisionProviderTimeoutMs: number;
  private readonly explainDecisionExecutor: (
    capsule: ExplainDecisionCapsule
  ) => Promise<ExplainDecisionWorkerOutput> | ExplainDecisionWorkerOutput;
  private readonly explainDecisionLlmEnabled: boolean;
  private readonly explainDecisionLlmExecutor: (
    capsule: ExplainDecisionCapsule,
    endpoint: DistillerEndpoint
  ) => Promise<ExplainDecisionWorkerOutput> | ExplainDecisionWorkerOutput;
  private readonly postmortemReviewEnabled: boolean;
  private readonly postmortemReviewTimeoutMs: number;
  private readonly postmortemReviewProviderTimeoutMs: number;
  private readonly postmortemReviewExecutor: (
    capsule: PostmortemReviewCapsule
  ) => Promise<PostmortemReviewWorkerOutput> | PostmortemReviewWorkerOutput;
  private readonly postmortemReviewLlmEnabled: boolean;
  private readonly postmortemReviewLlmExecutor: (
    capsule: PostmortemReviewCapsule,
    endpoint: DistillerEndpoint
  ) => Promise<PostmortemReviewWorkerOutput> | PostmortemReviewWorkerOutput;
  private readonly timeoutCircuitThreshold: number;
  private explainTimeoutStreak = 0;
  private postmortemTimeoutStreak = 0;

  constructor(options: HybridWorkerClientOptions = {}) {
    this.explainDecisionEnabled = options.explainDecisionEnabled ?? true;
    this.explainDecisionTimeoutMs = options.explainDecisionTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.explainDecisionProviderTimeoutMs =
      options.explainDecisionProviderTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
    this.explainDecisionExecutor = options.explainDecisionExecutor ?? runExplainDecisionWorker;
    this.explainDecisionLlmEnabled = options.explainDecisionLlmEnabled ?? false;
    this.explainDecisionLlmExecutor =
      options.explainDecisionLlmExecutor
      ?? ((capsule, endpoint) => runExplainDecisionLlmWorker(capsule, { endpoint }));
    this.postmortemReviewEnabled = options.postmortemReviewEnabled ?? true;
    this.postmortemReviewTimeoutMs = options.postmortemReviewTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.postmortemReviewProviderTimeoutMs =
      options.postmortemReviewProviderTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
    this.postmortemReviewExecutor = options.postmortemReviewExecutor ?? runPostmortemReviewWorker;
    this.postmortemReviewLlmEnabled = options.postmortemReviewLlmEnabled ?? false;
    this.postmortemReviewLlmExecutor =
      options.postmortemReviewLlmExecutor
      ?? ((capsule, endpoint) => runPostmortemReviewLlmWorker(capsule, { endpoint }));
    this.timeoutCircuitThreshold = options.timeoutCircuitThreshold ?? DEFAULT_CIRCUIT_THRESHOLD;
  }

  async runExplainDecision(
    capsule: ExplainDecisionCapsule,
    options: {
      mode?: "deterministic" | "provider";
      endpoint?: DistillerEndpoint;
    } = {}
  ): Promise<HybridExplainResult> {
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
      const timeoutMs =
        options.mode === "provider" ? this.explainDecisionProviderTimeoutMs : this.explainDecisionTimeoutMs;
      const run =
        options.mode === "provider"
          ? () => {
              if (!this.explainDecisionLlmEnabled || !options.endpoint) {
                throw new Error("provider_disabled");
              }
              return this.explainDecisionLlmExecutor(capsule, options.endpoint);
            }
          : () => this.explainDecisionExecutor(capsule);
      const result = await Promise.race([
        Promise.resolve(run()),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
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
      if (error instanceof Error && error.message === "provider_disabled") {
        this.explainTimeoutStreak = 0;
        return {
          status: "fallback",
          reason: "disabled"
        };
      }
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

  async runPostmortemReview(
    capsule: PostmortemReviewCapsule,
    options: {
      mode?: "deterministic" | "provider";
      endpoint?: DistillerEndpoint;
    } = {}
  ): Promise<HybridPostmortemResult> {
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
      const timeoutMs =
        options.mode === "provider" ? this.postmortemReviewProviderTimeoutMs : this.postmortemReviewTimeoutMs;
      const run =
        options.mode === "provider"
          ? () => {
              if (!this.postmortemReviewLlmEnabled || !options.endpoint) {
                throw new Error("provider_disabled");
              }
              return this.postmortemReviewLlmExecutor(capsule, options.endpoint);
            }
          : () => this.postmortemReviewExecutor(capsule);
      const result = await Promise.race([
        Promise.resolve(run()),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
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
      if (error instanceof Error && error.message === "provider_disabled") {
        this.postmortemTimeoutStreak = 0;
        return {
          status: "fallback",
          reason: "provider_unavailable"
        };
      }
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
