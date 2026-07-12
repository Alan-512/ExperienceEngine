import { resolve } from "node:path";
import { validateRuntimeClosureManifest } from "../../dist/runtime/package/closure-manifest.js";

const targetRoot = resolve(process.argv[2] ?? process.cwd());
const report = validateRuntimeClosureManifest(targetRoot);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.valid) {
  process.exitCode = 1;
}
