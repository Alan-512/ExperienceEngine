import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  CLAUDE_MARKETPLACE_STATE_FILENAME,
  readClaudeMarketplaceRuntimeState,
  touchClaudeMarketplaceHeartbeat
} from "../../src/install/claude-marketplace-state.js";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "experienceengine-claude-marketplace-state-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("Claude marketplace runtime state", () => {
  it("reads marketplace state from the experienceengine home", () => {
    const home = makeTempDir();
    writeFileSync(
      join(home, CLAUDE_MARKETPLACE_STATE_FILENAME),
      JSON.stringify(
        {
          adapter: "claude-code",
          install_mode: "marketplace",
          hook_source: "marketplace",
          package_version: "0.1.3",
          written_at: "2026-03-27T09:00:00.000Z"
        },
        null,
        2
      )
    );

    expect(readClaudeMarketplaceRuntimeState(home)?.install_mode).toBe("marketplace");
  });

  it("updates the mcp heartbeat without removing existing marker fields", () => {
    const home = makeTempDir();
    const statePath = join(home, CLAUDE_MARKETPLACE_STATE_FILENAME);
    writeFileSync(
      statePath,
      JSON.stringify(
        {
          adapter: "claude-code",
          install_mode: "marketplace",
          hook_source: "marketplace",
          package_version: "0.1.3",
          written_at: "2026-03-27T09:00:00.000Z",
          last_hook_seen_at: "2026-03-27T09:05:00.000Z"
        },
        null,
        2
      )
    );

    touchClaudeMarketplaceHeartbeat(home, "mcp", "2026-03-27T09:10:00.000Z");

    const updated = JSON.parse(readFileSync(statePath, "utf8")) as Record<string, string>;
    expect(updated.install_mode).toBe("marketplace");
    expect(updated.hook_source).toBe("marketplace");
    expect(updated.last_hook_seen_at).toBe("2026-03-27T09:05:00.000Z");
    expect(updated.last_mcp_seen_at).toBe("2026-03-27T09:10:00.000Z");
  });
});
