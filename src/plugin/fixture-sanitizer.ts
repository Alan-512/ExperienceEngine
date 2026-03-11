type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const SENSITIVE_KEY_PATTERN =
  /(token|authorization|auth|cookie|secret|password|api[_-]?key|session[_-]?token|access[_-]?token|refresh[_-]?token)/i;
const PATH_KEY_PATTERN = /(cwd|root|path|workspace|repo)/i;
const IDENTITY_KEY_PATTERN = /(email|phone|user(name)?|displayName|account|target|channelId|chatId|sender|recipient)/i;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const TOKEN_PATTERN = /\b(?:gh[opsu]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{16,}|Bearer\s+[A-Za-z0-9._-]{10,})\b/g;

const sanitizeString = (value: string, keyPath: string[]): string => {
  const joined = keyPath.join(".");

  if (SENSITIVE_KEY_PATTERN.test(joined)) {
    return "<redacted-secret>";
  }

  if (PATH_KEY_PATTERN.test(joined)) {
    return value.replace(/([A-Za-z]:)?\/[^\s"]+/g, "/redacted/path");
  }

  if (IDENTITY_KEY_PATTERN.test(joined)) {
    return "<redacted-identity>";
  }

  return value
    .replace(UUID_PATTERN, "<uuid>")
    .replace(TOKEN_PATTERN, "<redacted-secret>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<redacted-email>");
};

const sanitizeValue = (value: unknown, keyPath: string[] = []): JsonValue => {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeString(value, keyPath);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeValue(item, [...keyPath, String(index)]));
  }

  if (typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sanitizeValue(nested, [...keyPath, key]);
    }
    return result;
  }

  return String(value);
};

export const sanitizeRuntimePayload = <T>(payload: T): JsonValue => sanitizeValue(payload);
