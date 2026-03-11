import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { nowIso } from "../../utils/clock.js";

export const appendJsonlLog = (filePath: string, payload: Record<string, unknown>): void => {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  appendFileSync(filePath, JSON.stringify({ timestamp: nowIso(), ...payload }) + "\n", "utf8");
};

