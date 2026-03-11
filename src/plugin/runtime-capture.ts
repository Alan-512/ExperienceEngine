import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExperienceEngineConfig } from "../config/config-schema.js";
import type { OpenClawLogger } from "../types/plugin.js";
import { nowIso } from "../utils/clock.js";
import { createId } from "../utils/ids.js";

const slugify = (value: string): string => {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.slice(0, 48) || "unknown";
};

export class RuntimeCaptureWriter {
  constructor(
    private readonly config: ExperienceEngineConfig,
    private readonly logger: OpenClawLogger = {}
  ) {}

  capture(event: string, sessionId: string | undefined, payload: unknown): void {
    if (!this.config.captureRawPayloads) {
      return;
    }

    mkdirSync(this.config.captureDir, { recursive: true });

    const fileName = [
      nowIso().replace(/[:.]/g, "-"),
      slugify(sessionId ?? "global"),
      slugify(event),
      createId("capture")
    ].join("-");
    const filePath = join(this.config.captureDir, `${fileName}.json`);

    writeFileSync(
      filePath,
      JSON.stringify(
        {
          capturedAt: nowIso(),
          event,
          sessionId: sessionId ?? null,
          payload
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    this.logger.debug?.("experienceengine.capture", {
      event,
      sessionId,
      filePath
    });
  }
}
