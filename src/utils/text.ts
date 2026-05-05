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
  "Conservative execution hints:",
  "Diagnostic lead from prior experience:",
  "Relevant prior experience:",
  "Validated prior experience:",
  "Project constraint or explicit instruction:"
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

export const stripInlineCodeSpans = (value: string): string =>
  normalizeWhitespace(
    value
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]*`/g, " ")
  );

const SHELL_COMMAND_TOKENS = [
  "cd",
  "pwd",
  "ls",
  "cat",
  "echo",
  "test",
  "pnpm",
  "npm",
  "yarn",
  "bun",
  "node",
  "tsc",
  "vite",
  "webpack",
  "vitest",
  "jest",
  "playwright",
  "git",
  "rg",
  "grep",
  "sqlite3"
];

const shellLikePatterns = [
  /&&|\|\||\||;/,
  /\s-[a-zA-Z]/,
  /\/[A-Za-z0-9._/-]+/,
  /\b[A-Za-z0-9_-]+\.(ts|tsx|js|jsx|json|md|sql|sh)\b/i
];

const looksShellLikeClause = (value: string): boolean => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return false;
  }

  const lower = normalized.toLowerCase();
  if (SHELL_COMMAND_TOKENS.some((token) => new RegExp(`\\b${token}\\b`, "i").test(lower))) {
    return true;
  }

  return shellLikePatterns.some((pattern) => pattern.test(normalized));
};

export const stripShellLikeTaskCommands = (value: string): string =>
  normalizeWhitespace(
    value.replace(
      /\b(?:first run|run|then run|next run)\s+([^.!?]+)([.!?])/gi,
      (match, clause, punctuation) => (looksShellLikeClause(clause) ? punctuation : match)
    )
  );
