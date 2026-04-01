import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inspectPostmortemValidation,
  runClaudePostmortemValidation
} from "../../scripts/validation/claude-validate-postmortem.js";

describe("claude postmortem validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports a newly created phase3 trace and artifact delta", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "ee-claude-postmortem-"));
    const loadBefore = vi.fn().mockReturnValue({
      traceCount: 1,
      artifactCount: 0,
      latestTrace: {
        sessionId: "older-session",
        validationStatus: "fallback",
        fallbackReason: "timeout",
        createdAt: "2026-04-01T00:00:00.000Z"
      }
    });
    const loadAfter = vi.fn().mockReturnValue({
      traceCount: 2,
      artifactCount: 1,
      latestTrace: {
        sessionId: "new-session",
        validationStatus: "accepted",
        fallbackReason: null,
        createdAt: "2026-04-01T01:00:00.000Z"
      }
    });
    const spawnSync = vi.fn().mockReturnValue({
      status: 0,
      stdout: "",
      stderr: ""
    });

    const report = await runClaudePostmortemValidation({
      cwd,
      loadSnapshot: vi
        .fn()
        .mockImplementationOnce(loadBefore)
        .mockImplementationOnce(loadAfter),
      spawnSync
    });

    expect(spawnSync).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["-p", "--permission-mode", "bypassPermissions"]),
      expect.objectContaining({ cwd, encoding: "utf8" })
    );
    expect(report.traceDelta).toBe(1);
    expect(report.artifactDelta).toBe(1);
    expect(report.newTraceCreated).toBe(true);
    expect(report.latestTrace?.sessionId).toBe("new-session");
    expect(report.latestTrace?.validationStatus).toBe("accepted");
  });

  it("detects that no new postmortem trace was created", () => {
    const result = inspectPostmortemValidation(
      {
        traceCount: 3,
        artifactCount: 1,
        latestTrace: {
          sessionId: "same-session",
          validationStatus: "fallback",
          fallbackReason: "timeout",
          createdAt: "2026-04-01T00:10:00.000Z"
        }
      },
      {
        traceCount: 3,
        artifactCount: 1,
        latestTrace: {
          sessionId: "same-session",
          validationStatus: "fallback",
          fallbackReason: "timeout",
          createdAt: "2026-04-01T00:10:00.000Z"
        }
      }
    );

    expect(result.traceDelta).toBe(0);
    expect(result.artifactDelta).toBe(0);
    expect(result.newTraceCreated).toBe(false);
    expect(result.latestTrace?.sessionId).toBe("same-session");
  });
});
