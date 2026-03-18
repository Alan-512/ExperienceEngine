export class DistillationExecutionError extends Error {
  constructor(
    readonly bucket: string,
    message: string
  ) {
    super(message);
    this.name = "DistillationExecutionError";
  }
}

export const getDistillationFailureBucket = (error: unknown): string =>
  error instanceof DistillationExecutionError ? error.bucket : "distillation_failed";
