import { z } from "zod";

export const configSchema = z.object({
  dataDir: z.string().default("./data"),
  sqlitePath: z.string().default("./data/sqlite/experienceengine.db"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  maxHints: z.number().int().min(1).max(3).default(3),
  triggerThreshold: z.number().min(0).max(1).default(0.6)
});

export type ExperienceEngineConfig = z.infer<typeof configSchema>;

