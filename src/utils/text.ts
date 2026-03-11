export const truncate = (value: string, max = 240): string =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}...`;

export const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

export const toSentence = (value: string): string => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return normalized;
  }

  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
};

export const tokenize = (value: string): string[] =>
  normalizeWhitespace(value)
    .toLowerCase()
    .split(/[^a-z0-9_]+/i)
    .filter(Boolean);

export const stripLeadingTimestampTag = (value: string): string =>
  normalizeWhitespace(value).replace(/^\[[^\]]+\]\s*/, "");
