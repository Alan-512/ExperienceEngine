import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { sanitizeRuntimePayload } from "../../src/plugin/fixture-sanitizer.js";

const [, , inputPathArg, outputPathArg] = process.argv;

if (!inputPathArg) {
  console.error("Usage: pnpm tsx scripts/openclaw/promote-runtime-payload.ts <input.json> [output.json]");
  process.exit(1);
}

const inputPath = resolve(inputPathArg);
const outputPath = resolve(
  outputPathArg ?? `tests/fixtures/openclaw/${basename(inputPathArg).replace(/\.json$/i, "")}.sanitized.json`
);

const payload = JSON.parse(readFileSync(inputPath, "utf8"));
const sanitized = sanitizeRuntimePayload(payload);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(sanitized, null, 2) + "\n", "utf8");

console.log(`Sanitized fixture written to ${outputPath}`);
