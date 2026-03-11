import { describe, expect, it } from "vitest";
import { sanitizeRuntimePayload } from "../../src/plugin/fixture-sanitizer.js";

describe("sanitizeRuntimePayload", () => {
  it("redacts secret, path, and identity values while preserving structure", () => {
    const sanitized = sanitizeRuntimePayload({
      session: {
        key: "550e8400-e29b-41d4-a716-446655440000"
      },
      workspace: {
        cwd: "/Users/alice/projects/secret-repo"
      },
      authToken: "Bearer sk-1234567890ABCDEFGHIJKLMNOP",
      senderEmail: "alice@example.com",
      tool: {
        name: "pnpm test",
        args: ["auth"]
      }
    }) as Record<string, unknown>;

    expect(sanitized.authToken).toBe("<redacted-secret>");
    expect((sanitized.workspace as Record<string, unknown>).cwd).toBe("/redacted/path");
    expect(sanitized.senderEmail).toBe("<redacted-identity>");
    expect(((sanitized.tool as Record<string, unknown>).name)).toBe("pnpm test");
  });
});
