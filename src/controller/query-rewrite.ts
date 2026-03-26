export type RetrievalQuery = {
  rawQueryText: string;
  retrievalQueryText: string;
  rewriteApplied: boolean;
  removedClauses: string[];
  addedContextTerms: string[];
};

const CLAUSE_SPLIT_PATTERN = /[\n.;]+/;
const INLINE_NOISE_PATTERNS = [
  /\bin (?:this|the current) workspace\b/gi,
  /\bwithin (?:this|the current) workspace\b/gi,
  /\bfrom (?:this|the current) workspace\b/gi,
  /\bin read[- ]only mode\b/gi
];
const PROCEDURAL_ONLY_PATTERNS = [
  /^(?:read[- ]only|read only analysis only|analysis only)$/i,
  /^(?:read[- ]only analysis|read-only analysis only)$/i,
  /^(?:do not modify files?|no file modifications?|without modifying files?|no code changes?)$/i,
  /^(?:read[- ]only analysis only;?\s*do not modify files?)$/i
];
const FAILURE_CONTEXT_PATTERN = /\b(fail|failed|failing|failure)\b/i;
const REGRESSION_PATTERN = /\bregression\b/i;
const TEST_PATTERN = /\btest\b/i;
const AUTH_PATTERN = /\b(auth|authentication)\b/i;
const HANDSHAKE_PATTERN = /\b(fixture handshake|handshake behavior)\b/i;

const normalizeTerms = (text: string): string =>
  text
    .replace(/\bauthentication\b/gi, "auth")
    .replace(/\bhandshake behavior\b/gi, "fixture handshake")
    .replace(/\s+/g, " ")
    .trim();

const normalizeClause = (clause: string): string =>
  normalizeTerms(INLINE_NOISE_PATTERNS.reduce((text, pattern) => text.replace(pattern, ""), clause));

export const buildRetrievalQuery = (taskSummary: string, contextSummary?: string): RetrievalQuery => {
  const rawQueryText = [taskSummary, contextSummary].filter(Boolean).join("\n").trim();
  const removedClauses: string[] = [];
  const keptClauses = rawQueryText
    .split(CLAUSE_SPLIT_PATTERN)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .map((clause) => {
      const normalized = normalizeClause(clause);
      if (!normalized) {
        removedClauses.push(clause);
        return null;
      }

      if (PROCEDURAL_ONLY_PATTERNS.some((pattern) => pattern.test(normalized))) {
        removedClauses.push(clause);
        return null;
      }

      return normalized;
    })
    .filter((clause): clause is string => Boolean(clause));

  const addedContextTerms: string[] = [];
  const baseQueryText = normalizeTerms(keptClauses.join(". ").trim() || rawQueryText);

  if (
    REGRESSION_PATTERN.test(rawQueryText) &&
    (TEST_PATTERN.test(rawQueryText) || (AUTH_PATTERN.test(rawQueryText) && HANDSHAKE_PATTERN.test(rawQueryText))) &&
    !FAILURE_CONTEXT_PATTERN.test(rawQueryText)
  ) {
    addedContextTerms.push("failing test");
  }

  const retrievalQueryText = [baseQueryText, ...addedContextTerms].filter(Boolean).join("\n").trim();

  return {
    rawQueryText,
    retrievalQueryText,
    rewriteApplied: retrievalQueryText !== rawQueryText,
    removedClauses,
    addedContextTerms
  };
};
