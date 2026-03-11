export class ExperienceEngineError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ExperienceEngineError";
  }
}

