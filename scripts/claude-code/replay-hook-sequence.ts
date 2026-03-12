import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { processClaudeHookPayload } from "../../src/cli/commands/claude-hook.js";

type HookFixture = {
  envHome?: string;
  events: Array<unknown>;
};

const [, , fixturePathArg] = process.argv;

if (!fixturePathArg) {
  console.error("Usage: pnpm tsx scripts/claude-code/replay-hook-sequence.ts <fixture.json>");
  process.exit(1);
}

const fixturePath = resolve(fixturePathArg);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as HookFixture;
const tempHome = fixture.envHome ?? mkdtempSync(join(tmpdir(), "experienceengine-claude-replay-"));

const run = async () => {
  try {
    for (const event of fixture.events) {
      await processClaudeHookPayload(JSON.stringify(event), {
        homeDir: tempHome,
        env: {
          EXPERIENCE_ENGINE_HOME: join(tempHome, ".experienceengine")
        }
      });
    }

    console.log(`Replayed ${fixture.events.length} Claude hook events`);
    console.log(`Validation home: ${tempHome}`);
  } finally {
    if (!fixture.envHome) {
      rmSync(tempHome, { recursive: true, force: true });
    }
  }
};

await run();
