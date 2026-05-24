import { hashText } from "./hashing.js";

// Common secret/api key regexes for redaction
const SECRET_PATTERNS = [
  // OpenAI API Key
  /\bsk-[a-zA-Z0-9]{48,}\b/g,
  // Anthropic API Key
  /\bsk-ant-[a-zA-Z0-9]{60,}\b/g,
  // Gemini API Key
  /\bAIzaSy[a-zA-Z0-9_-]{33}\b/g,
  // Generic Bearer Token
  /\bBearer\s+[a-zA-Z0-9._~+/-]+=*\b/gi,
  // Generic password fields in config strings (e.g. password=XYZ)
  /\b(password|pass|secret|token|key|api_key|apikey|auth|jwt|credential|private_key|pwd)\s*[:=]\s*["']?[^"'\s]{8,}["']?/gi
];

/**
 * Redacts secret-like values (API keys, tokens, passwords) from a given string.
 */
export const redactSecrets = (value: string): string => {
  if (!value) return value;
  let redacted = value;
  
  // Apply standard key patterns
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (match) => {
      if (match.includes(":") || match.includes("=")) {
        // Redact only the value part, preserving separators and spacing
        return match.replace(/([:=]\s*)["']?[^"'\s]{8,}["']?/, "$1[REDACTED]");
      }
      return "[REDACTED]";
    });
  }

  return redacted;
};

/**
 * Returns a bounded summary of a large text/payload and a content hash.
 * If the string exceeds the maximum length, truncates it and appends hash context.
 */
export const getBoundedSummary = (
  content: string,
  maxLength = 1000
): { summary: string; contentHash: string; isRedacted: boolean } => {
  if (!content) {
    return { summary: "", contentHash: hashText(""), isRedacted: false };
  }

  const redactedContent = redactSecrets(content);
  const isRedacted = redactedContent !== content;
  const contentHash = hashText(redactedContent);

  let summary = redactedContent;
  if (redactedContent.length > maxLength) {
    summary = redactedContent.slice(0, maxLength - 50) + `... [TRUNCATED, HASH: ${contentHash.slice(0, 8)}]`;
  }

  return {
    summary,
    contentHash,
    isRedacted
  };
};
