import { normalizeWhitespace, truncate } from "../utils/text.js";

export const adaptContextSummary = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = normalizeWhitespace(value);
  return normalized ? truncate(normalized, 400) : undefined;
};

