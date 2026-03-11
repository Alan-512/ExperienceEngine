import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import plugin from "../../src/plugin/openclaw-plugin.js";

type Handler = (payload: unknown) => unknown | Promise<unknown>;
type ReplayScenario = {
  name?: string;
  seedPrompt: Record<string, unknown>;
  toolResult: Record<string, unknown>;
  finalize: Record<string, unknown>;
  replayPrompt: Record<string, unknown>;
};

const [, , fixturePathArg] = process.argv;

if (!fixturePathArg) {
  console.error("Usage: pnpm tsx scripts/openclaw/replay-runtime-fixture.ts <fixture.json>");
  process.exit(1);
}

const fixturePath = resolve(fixturePathArg);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as ReplayScenario;
const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-replay-"));
const sqlitePath = join(runtimeDir, "data", "sqlite", "experienceengine.db");
const handlers = new Map<string, Handler>();

try {
  plugin.register({
    config: {
      dataDir: join(runtimeDir, "data"),
      sqlitePath,
      triggerThreshold: 0.6,
      maxHints: 3
    },
    on(event, handler) {
      handlers.set(event, handler);
    }
  });

  await handlers.get("before_prompt_build")?.(structuredClone(fixture.seedPrompt));
  await handlers.get("tool_result_persist")?.(structuredClone(fixture.toolResult));
  await handlers.get("message_sent")?.(structuredClone(fixture.finalize));
  const replayResult = (await handlers.get("before_prompt_build")?.(structuredClone(fixture.replayPrompt))) as
    | Record<string, unknown>
    | undefined;

  const db = new DatabaseSync(sqlitePath);
  const counts = {
    inputs: (db.prepare("SELECT COUNT(*) AS count FROM experience_input_records").get() as { count: number }).count,
    nodes: (db.prepare("SELECT COUNT(*) AS count FROM experience_nodes").get() as { count: number }).count,
    stats: (db.prepare("SELECT COUNT(*) AS count FROM scope_task_stats").get() as { count: number }).count
  };

  console.log(
    JSON.stringify(
      {
        fixture: fixture.name ?? fixturePath,
        counts,
        prependContext: replayResult?.prependContext ?? null
      },
      null,
      2
    )
  );
} finally {
  rmSync(runtimeDir, { recursive: true, force: true });
}
