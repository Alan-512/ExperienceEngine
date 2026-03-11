import { createHash, randomUUID } from "node:crypto";

export const createId = (prefix: string): string => `${prefix}_${randomUUID()}`;

export const stableId = (prefix: string, input: string): string => {
  const digest = createHash("sha1").update(input).digest("hex").slice(0, 12);
  return `${prefix}_${digest}`;
};

