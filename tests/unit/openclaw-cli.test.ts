import { describe, expect, it } from "vitest";
import {
  buildOpenClawInstallCommands,
  runOpenClawCommands
} from "../../src/install/openclaw-cli.js";

describe("OpenClaw CLI install wiring", () => {
  it("builds the documented link-enable-config command sequence", () => {
    const commands = buildOpenClawInstallCommands("/tmp/experienceengine", "experienceengine", "install", {
      dataDir: "/tmp/ee",
      sqlitePath: "/tmp/ee/sqlite/experienceengine.db",
      captureDir: "/tmp/ee/captures"
    });

    expect(commands.map((command) => [command.bin, ...command.args])).toEqual([
      ["openclaw", "plugins", "install", "/tmp/experienceengine"],
      ["openclaw", "plugins", "enable", "experienceengine"],
      [
        "openclaw",
        "config",
        "set",
        "plugins.entries.experienceengine.config",
        "{\"dataDir\":\"/tmp/ee\",\"sqlitePath\":\"/tmp/ee/sqlite/experienceengine.db\",\"captureDir\":\"/tmp/ee/captures\"}",
        "--json"
      ]
    ]);
  });

  it("runs commands sequentially through the injected runner", () => {
    const seen: string[] = [];
    runOpenClawCommands(
      [
        { bin: "openclaw", args: ["plugins", "install"], description: "install" },
        { bin: "openclaw", args: ["plugins", "enable", "experienceengine"], description: "enable" }
      ],
      (command) => {
        seen.push([command.bin, ...command.args].join(" "));
      }
    );

    expect(seen).toEqual([
      "openclaw plugins install",
      "openclaw plugins enable experienceengine"
    ]);
  });

  it("builds an update command when the plugin already exists", () => {
    const commands = buildOpenClawInstallCommands("/tmp/experienceengine", "experienceengine", "update", {
      dataDir: "/tmp/ee",
      sqlitePath: "/tmp/ee/sqlite/experienceengine.db",
      captureDir: "/tmp/ee/captures"
    });

    expect([commands[0].bin, ...commands[0].args]).toEqual([
      "openclaw",
      "plugins",
      "update",
      "experienceengine"
    ]);
  });
});
