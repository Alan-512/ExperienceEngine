import { describe, expect, it } from "vitest";
import { ExperienceOperationalActionsService } from "../../src/interaction/operational-actions-service.js";

describe("ExperienceOperationalActionsService", () => {
  it("creates plan tokens and executes an upgrade using canonical installer semantics", () => {
    const service = new ExperienceOperationalActionsService({
      tokenFactory: (() => {
        let count = 0;
        return () => `token-${++count}`;
      })(),
      inspectCodexInstall: () => ({
        versionStatus: {
          recordedVersion: "0.1.0"
        }
      }),
      installCodexAdapter: () => ({
        adapter: "codex",
        installedVersion: "0.2.0"
      })
    });

    const plan = service.planOperation({
      adapter: "codex",
      operation: "upgrade"
    });

    expect(plan.planId).toBe("token-1");
    expect(plan.confirmationToken).toBe("token-2");
    expect(plan.commandHint).toBe("ee upgrade codex");

    const result = service.executePlannedOperation({
      planId: plan.planId,
      confirmationToken: plan.confirmationToken
    });

    expect(result).toMatchObject({
      status: "executed",
      adapter: "codex",
      operation: "upgrade",
      result: {
        previousVersion: "0.1.0",
        installedVersion: "0.2.0"
      }
    });
  });

  it("rejects execution when the confirmation token is missing or stale", () => {
    const service = new ExperienceOperationalActionsService({
      tokenFactory: (() => {
        let count = 0;
        return () => `token-${++count}`;
      })(),
      inspectOpenClawInstall: () => ({
        versionStatus: {
          recordedVersion: "0.1.0"
        }
      })
    });

    const plan = service.planOperation({
      adapter: "openclaw",
      operation: "install"
    });

    expect(() =>
      service.executePlannedOperation({
        planId: plan.planId,
        confirmationToken: "wrong-token"
      })
    ).toThrow("Invalid or expired confirmation token");
  });

  it("rejects unsupported repair targets during planning", () => {
    const service = new ExperienceOperationalActionsService();

    expect(() =>
      service.planOperation({
        adapter: "claude-code",
        operation: "repair"
      })
    ).toThrow("Unsupported repair operation for claude-code");
  });
});
