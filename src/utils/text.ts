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

const EXPERIENCE_INJECTION_HEADINGS = [
  "Execution hints from prior similar tasks:",
  "Conservative execution hints:"
];

export const stripLeadingExperienceInjection = (value: string): string => {
  let next = value.trimStart();

  while (EXPERIENCE_INJECTION_HEADINGS.some((heading) => next.startsWith(heading))) {
    const separator = next.indexOf("\n\n");
    if (separator === -1) {
      return "";
    }

    next = next.slice(separator + 2).trimStart();
  }

  return next;
};

export const stripLeadingTimestampTag = (value: string): string =>
  normalizeWhitespace(value).replace(/^\[[^\]]+\]\s*/, "");
